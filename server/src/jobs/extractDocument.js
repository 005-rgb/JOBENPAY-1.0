import { readFile } from 'node:fs/promises';

import pool from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { logger } from '../lib/logger.js';
import { getDocument, updateDocumentAnalysis } from '../repositories/documents.js';
import { extractInvoiceSchema, PROMPT_VERSION as EXTRACT_PROMPT_VERSION } from '../ai/prompts/extractInvoice.js';
import { injectionCheckSchema } from '../ai/prompts/injectionCheck.js';
import { generateStructured } from '../ai/index.js';
import { AiError } from '../ai/errors.js';
import { detectInjectionHeuristics, mergeInjectionFlags } from '../documents/injection.js';
import { storedDocumentPath } from '../documents/storage.js';

async function extractText(document) {
  const file = await readFile(await storedDocumentPath(document.storage_key));
  if (document.mime === 'text/plain') {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(file), pdfTextItems: [] };
  }
  if (document.mime !== 'application/pdf') {
    return { text: '', pdfTextItems: [] };
  }

  const { extractText: extractPdfText, extractTextItems, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(file), {
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const [{ text }, { items }] = await Promise.all([
    extractPdfText(pdf, { mergePages: true }),
    extractTextItems(pdf),
  ]);
  return {
    text: Array.isArray(text) ? text.join('\n') : text,
    pdfTextItems: items,
  };
}

async function writeAnalysis(orgId, documentId, status, injectionFlags, extraction, db = pool) {
  await withTx(async (tx) => {
    await updateDocumentAnalysis(orgId, documentId, {
      status,
      injectionFlags,
      extraction,
    }, tx);
  }, db);
}

async function failExtraction(orgId, documentId, flags, error, db) {
  await writeAnalysis(orgId, documentId, 'EXTRACTION_FAILED', flags, undefined, db);
  if (error instanceof AiError) {
    logger.warn({ orgId, documentId, kind: error.kind }, 'Document AI extraction failed closed');
  } else {
    logger.warn({ orgId, documentId }, 'Document extraction failed');
  }
}

export async function extractDocument(job, {
  db = pool,
  generate = generateStructured,
  readText = extractText,
} = {}) {
  const documentId = job.payload?.documentId;
  const orgId = job.payload?.orgId;
  if (!documentId || !orgId) {
    throw new TypeError('extract_document jobs require documentId and orgId.');
  }
  const document = await getDocument(orgId, documentId, db);
  if (!document || document.status === 'DELETED' || !document.storage_key) return;

  if (document.mime === 'image/png' || document.mime === 'image/jpeg') {
    await writeAnalysis(orgId, documentId, 'NEEDS_MANUAL_REVIEW', document.injection_flags || [], undefined, db);
    return;
  }

  let extracted;
  try {
    extracted = await readText(document);
  } catch (error) {
    await failExtraction(orgId, documentId, document.injection_flags || [], error, db);
    return;
  }
  const fullText = String(extracted.text || '');
  if (!fullText.trim()) {
    await writeAnalysis(orgId, documentId, 'NEEDS_MANUAL_REVIEW', [], undefined, db);
    return;
  }

  const heuristicFlags = detectInjectionHeuristics(fullText, { pdfTextItems: extracted.pdfTextItems });
  const promptText = fullText.slice(0, 20_000);
  await writeAnalysis(orgId, documentId, 'EXTRACTING', heuristicFlags, undefined, db);

  let injectionResult;
  try {
    injectionResult = await generate({
      task: 'injectionCheck',
      schema: injectionCheckSchema,
      input: { documentText: promptText },
      orgId,
    });
  } catch (error) {
    await failExtraction(orgId, documentId, heuristicFlags, error, db);
    return;
  }
  const injectionFlags = mergeInjectionFlags(heuristicFlags, injectionResult);

  let extraction;
  try {
    extraction = await generate({
      task: 'extractInvoice',
      schema: extractInvoiceSchema,
      input: { documentText: promptText },
      orgId,
    });
  } catch (error) {
    await failExtraction(orgId, documentId, injectionFlags, error, db);
    return;
  }

  await writeAnalysis(orgId, documentId, 'EXTRACTED', injectionFlags, {
    ...extraction,
    promptVersion: EXTRACT_PROMPT_VERSION,
  }, db);
}
