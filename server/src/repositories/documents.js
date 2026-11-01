import pool from '../db/pool.js';

function assertOrgId(orgId) {
  if (!orgId) throw new Error('orgId is required for document repository methods.');
}

export async function createDocument(orgId, {
  uploaderKind,
  uploaderId,
  filename,
  mime,
  size,
  sha256,
  storageKey,
  status = 'RECEIVED',
}, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(`
    INSERT INTO documents (
      org_id, uploader_kind, uploader_id, filename, mime, size, sha256, storage_key, status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [orgId, uploaderKind, uploaderId, filename, mime, size, sha256, storageKey, status]);
  return result.rows[0];
}

export async function listDocuments(orgId, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(`
    SELECT id, created_at, uploader_kind, filename, mime, size, sha256, status, injection_flags
    FROM documents
    WHERE org_id = $1
    ORDER BY created_at DESC, id
    LIMIT 100
  `, [orgId]);
  return result.rows;
}

export async function getDocument(orgId, documentId, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(`
    SELECT id, created_at, org_id, uploader_kind, uploader_id, filename, mime, size,
           sha256, storage_key, status, injection_flags
    FROM documents
    WHERE org_id = $1 AND id = $2
    LIMIT 1
  `, [orgId, documentId]);
  return result.rows[0] ?? null;
}

export async function findDocumentByHash(orgId, sha256, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(`
    SELECT id
    FROM documents
    WHERE org_id = $1 AND sha256 = $2 AND status <> 'DELETED'
    LIMIT 1
  `, [orgId, sha256]);
  return result.rows[0] ?? null;
}

export async function getDocumentExtraction(orgId, documentId, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(`
    SELECT payee_name, invoice_number, amount_minor, currency, due_date, items, notes,
           confidence, prompt_version
    FROM document_extractions
    WHERE org_id = $1 AND document_id = $2
    LIMIT 1
  `, [orgId, documentId]);
  return result.rows[0] ?? null;
}

export async function updateDocumentAnalysis(orgId, documentId, {
  status,
  injectionFlags,
  extraction,
}, db = pool) {
  assertOrgId(orgId);
  const updated = await db.query(`
    UPDATE documents
    SET status = $3, injection_flags = $4::jsonb
    WHERE org_id = $1 AND id = $2 AND status <> 'DELETED'
    RETURNING id
  `, [orgId, documentId, status, JSON.stringify(injectionFlags)]);
  if (updated.rowCount !== 1) return false;

  if (extraction) {
    await db.query(`
      INSERT INTO document_extractions (
        org_id, document_id, payee_name, invoice_number, amount_minor, currency,
        due_date, items, notes, confidence, prompt_version
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
      ON CONFLICT (org_id, document_id) DO UPDATE SET
        payee_name = EXCLUDED.payee_name,
        invoice_number = EXCLUDED.invoice_number,
        amount_minor = EXCLUDED.amount_minor,
        currency = EXCLUDED.currency,
        due_date = EXCLUDED.due_date,
        items = EXCLUDED.items,
        notes = EXCLUDED.notes,
        confidence = EXCLUDED.confidence,
        prompt_version = EXCLUDED.prompt_version,
        created_at = now()
    `, [
      orgId,
      documentId,
      extraction.payeeName,
      extraction.invoiceNumber,
      extraction.amountMinor,
      extraction.currency,
      extraction.dueDate,
      JSON.stringify(extraction.items),
      extraction.notes,
      extraction.confidence,
      extraction.promptVersion,
    ]);
  }
  return true;
}

export async function markDocumentDeleted(orgId, documentId, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(`
    UPDATE documents
    SET status = 'DELETED'
    WHERE org_id = $1 AND id = $2 AND status <> 'DELETED'
    RETURNING id, sha256, storage_key
  `, [orgId, documentId]);
  return result.rows[0] ?? null;
}
