import { withTx } from '../db/tx.js';
import pool from '../db/pool.js';
import { enqueue } from '../jobs/queue.js';
import { appendEntry, LEDGER_TYPES } from '../services/ledger.js';
import { createDocument } from '../repositories/documents.js';
import { removeStoredDocument, storeDocumentStream } from './storage.js';

export async function persistStoredDocument(stored, {
  orgId,
  uploaderKind = 'USER',
  uploaderId,
  db = pool,
}) {
  if (!orgId || !uploaderId) {
    await removeStoredDocument(stored.storageKey, stored.uploadDirectory);
    throw new TypeError('orgId and uploaderId are required to save a document.');
  }
  try {
    const save = async (tx) => {
      const document = await createDocument(orgId, {
        uploaderKind,
        uploaderId,
        filename: stored.filename,
        mime: stored.mime,
        size: stored.size,
        sha256: stored.sha256,
        storageKey: stored.storageKey,
      }, tx);
      await appendEntry(tx, {
        orgId,
        type: LEDGER_TYPES.DOCUMENT_ADDED,
        subjectType: 'DOCUMENT',
        subjectId: document.id,
        payload: { sha256: document.sha256 },
      });
      await enqueue(tx, {
        type: 'extract_document',
        orgId,
        payload: { documentId: document.id, orgId },
        dedupeKey: `document:${document.id}:extract`,
      });
      return document;
    };
    if (db === pool) return await withTx(save);
    const tx = await db.connect();
    try {
      await tx.query('BEGIN');
      const result = await save(tx);
      await tx.query('COMMIT');
      return result;
    } catch (error) {
      await tx.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      tx.release();
    }
  } catch (error) {
    await removeStoredDocument(stored.storageKey, stored.uploadDirectory);
    throw error;
  }
}

export async function uploadDocument({
  stream,
  filename,
  orgId,
  uploaderId,
  uploaderKind = 'USER',
  db = pool,
}) {
  const stored = await storeDocumentStream(stream, filename);
  return persistStoredDocument(stored, { orgId, uploaderId, uploaderKind, db });
}
