import pool from '../db/pool.js';
import { AppError } from '../lib/errors.js';

function assertOrgId(orgId) {
  if (!orgId) throw new Error('orgId is required for document repository methods.');
}

function resolveDbAndEnv(dbOrEnv, maybeEnv) {
  let db = pool;
  let environment = null;
  if (typeof dbOrEnv === 'string') {
    environment = dbOrEnv;
    db = maybeEnv || pool;
  } else {
    db = dbOrEnv || pool;
    environment = maybeEnv;
  }
  return { db, environment };
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
  environment = 'SANDBOX',
}, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(`
    INSERT INTO documents (
      org_id, uploader_kind, uploader_id, filename, mime, size, sha256, storage_key, status, environment
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `, [orgId, uploaderKind, uploaderId, filename, mime, size, sha256, storageKey, status, (environment || 'SANDBOX').toUpperCase()]);
  return result.rows[0];
}

export async function listDocuments(orgId, dbOrEnv = pool, maybeEnv = null) {
  assertOrgId(orgId);
  const { db, environment } = resolveDbAndEnv(dbOrEnv, maybeEnv);
  if (!environment || typeof environment !== 'string' || !environment.trim()) {
    const err = new AppError('ENVIRONMENT_REQUIRED', 400, 'Environment parameter is required for listDocuments.');
    err.code = 'ENVIRONMENT_REQUIRED';
    throw err;
  }
  const env = environment.trim().toUpperCase();
  const result = await db.query(`
    SELECT id, created_at, uploader_kind, filename, mime, size, sha256, status, injection_flags, environment
    FROM documents
    WHERE org_id = $1 AND environment = $2
    ORDER BY created_at DESC, id
    LIMIT 100
  `, [orgId, env]);
  return result.rows;
}

export async function getDocument(orgId, documentId, dbOrEnv = pool, maybeEnv = null) {
  assertOrgId(orgId);
  const { db, environment } = resolveDbAndEnv(dbOrEnv, maybeEnv);
  const conditions = ['org_id = $1', 'id = $2'];
  const params = [orgId, documentId];
  if (environment) {
    conditions.push('environment = $3');
    params.push(String(environment).toUpperCase());
  }
  const result = await db.query(`
    SELECT id, created_at, org_id, uploader_kind, uploader_id, filename, mime, size,
           sha256, storage_key, status, injection_flags, environment
    FROM documents
    WHERE ${conditions.join(' AND ')}
    LIMIT 1
  `, params);
  return result.rows[0] ?? null;
}

export async function findDocumentByHash(orgId, sha256, dbOrEnv = pool, maybeEnv = null) {
  assertOrgId(orgId);
  const { db, environment } = resolveDbAndEnv(dbOrEnv, maybeEnv);
  const params = [orgId, sha256];
  let envFilter = '';
  if (environment) {
    params.push(String(environment).toUpperCase());
    envFilter = ` AND environment = $${params.length}`;
  }
  const result = await db.query(`
    SELECT id, environment
    FROM documents
    WHERE org_id = $1 AND sha256 = $2 AND status <> 'DELETED'${envFilter}
    LIMIT 1
  `, params);
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

export async function markDocumentDeleted(orgId, documentId, dbOrEnv = pool, maybeEnv = null) {
  assertOrgId(orgId);
  const { db, environment } = resolveDbAndEnv(dbOrEnv, maybeEnv);
  const params = [orgId, documentId];
  let envFilter = '';
  if (environment) {
    params.push(String(environment).toUpperCase());
    envFilter = ` AND environment = $${params.length}`;
  }
  const result = await db.query(`
    UPDATE documents
    SET status = 'DELETED'
    WHERE org_id = $1 AND id = $2 AND status <> 'DELETED'${envFilter}
    RETURNING id, sha256, storage_key
  `, params);
  return result.rows[0] ?? null;
}
