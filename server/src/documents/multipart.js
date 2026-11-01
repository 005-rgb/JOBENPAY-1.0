import Busboy from 'busboy';

import { AppError } from '../lib/errors.js';
import { MAX_DOCUMENT_BYTES, storeDocumentStream, removeStoredDocument } from './storage.js';
import { persistStoredDocument } from './service.js';

function uploadError(code, message, statusCode) {
  const error = new AppError(code, message);
  error.statusCode = statusCode;
  return error;
}

export async function uploadMultipartDocument(req, { orgId, uploaderId, uploaderKind = 'USER' }) {
  const contentType = req.headers['content-type'] || '';
  if (!/^multipart\/form-data(?:;|$)/i.test(contentType)) {
    throw uploadError('DOCUMENT_MULTIPART_REQUIRED', 'A multipart document upload is required.', 400);
  }

  let parser;
  try {
    parser = Busboy({
      headers: req.headers,
      limits: {
        files: 1,
        fileSize: MAX_DOCUMENT_BYTES,
        fields: 10,
        fieldNameSize: 100,
        fieldSize: 1024,
      },
    });
  } catch {
    throw uploadError('DOCUMENT_MULTIPART_INVALID', 'Multipart document upload is invalid.', 400);
  }

  let fileCount = 0;
  let uploadTask = null;
  let parseError = null;
  const parserDone = new Promise((resolve, reject) => {
    parser.once('close', resolve);
    parser.once('error', reject);
  });

  parser.on('file', (fieldName, stream, info) => {
    fileCount += 1;
    if (fileCount !== 1 || fieldName !== 'file') {
      parseError = uploadError('DOCUMENT_MULTIPART_INVALID', 'Upload exactly one file in the file field.', 400);
      stream.resume();
      return;
    }

    uploadTask = storeDocumentStream(stream, info.filename).then(async (stored) => {
      if (stream.truncated) {
        await removeStoredDocument(stored.storageKey, stored.uploadDirectory);
        throw uploadError('DOCUMENT_TOO_LARGE', 'Document exceeds the 10 MB limit.', 413);
      }
      return stored;
    });
    uploadTask.catch((error) => {
      parseError = error;
    });
  });
  parser.on('filesLimit', () => {
    parseError = uploadError('DOCUMENT_MULTIPART_INVALID', 'Upload exactly one file.', 400);
  });
  parser.on('fieldsLimit', () => {
    parseError = uploadError('DOCUMENT_MULTIPART_INVALID', 'Too many multipart fields.', 400);
  });
  parser.on('field', (_name, _value, info) => {
    if (info.valueTruncated) {
      parseError = uploadError('DOCUMENT_MULTIPART_INVALID', 'Multipart field exceeds the allowed size.', 400);
    }
  });

  req.pipe(parser);
  try {
    await parserDone;
    if (parseError) throw parseError;
    if (!uploadTask) {
      throw uploadError('DOCUMENT_MULTIPART_INVALID', 'No file was provided.', 400);
    }
    const stored = await uploadTask;
    return await persistStoredDocument(stored, { orgId, uploaderId, uploaderKind });
  } catch (error) {
    if (uploadTask) {
      const stored = await uploadTask.catch(() => null);
      if (stored) await removeStoredDocument(stored.storageKey, stored.uploadDirectory);
    }
    throw error;
  }
}
