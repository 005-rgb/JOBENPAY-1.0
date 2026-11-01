import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, realpath, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import { env } from '../config.js';
import { AppError } from '../lib/errors.js';

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const STORAGE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function documentError(code, message, statusCode) {
  const error = new AppError(code, message);
  error.statusCode = statusCode;
  return error;
}

function isWithin(directory, target) {
  const relative = path.relative(directory, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export async function getUploadDirectory(directory = env.UPLOAD_DIR) {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const configured = directory || path.join(projectRoot, 'var', 'uploads');
  const uploadPath = path.resolve(process.cwd(), configured);
  const webRoot = path.resolve(projectRoot, 'web');
  if (isWithin(webRoot, uploadPath)) {
    throw new Error('UPLOAD_DIR must be outside the web root.');
  }
  await mkdir(uploadPath, { recursive: true, mode: 0o700 });
  const actualPath = await realpath(uploadPath);
  if (isWithin(webRoot, actualPath)) {
    throw new Error('UPLOAD_DIR must resolve outside the web root.');
  }
  return actualPath;
}

function safeFilename(filename) {
  const base = path.win32.basename(path.posix.basename(String(filename || 'document')));
  const safe = base.replace(/[\u0000-\u001f\u007f/\\]/g, '_').trim().slice(0, 255);
  return safe || 'document';
}

function sniffMime(prefix, isText) {
  if (prefix.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (prefix.length >= 8
    && prefix.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (prefix.length >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff) {
    return 'image/jpeg';
  }
  return isText ? 'text/plain' : null;
}

function expectedExtensionMismatch(filename, mime) {
  const extension = path.extname(filename).toLowerCase();
  const expected = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.txt': 'text/plain',
  }[extension];
  return Boolean(expected && expected !== mime);
}

function createInspector(filename) {
  const hash = createHash('sha256');
  let size = 0;
  let prefix = Buffer.alloc(0);
  let mode = null;
  let textDecoder;
  const pendingText = [];

  const validateText = (chunk, stream = true) => {
    if (!textDecoder) textDecoder = new TextDecoder('utf-8', { fatal: true });
    const text = textDecoder.decode(chunk, { stream });
    if (text.includes('\0') || /[\u0000-\u0008\u000b\u000e-\u001f\u007f]/.test(text)) {
      throw documentError('DOCUMENT_INVALID_TYPE', 'Only PDF, PNG, JPG, and UTF-8 text files are accepted.', 400);
    }
  };

  return {
    transform: new Transform({
      transform(chunk, _encoding, callback) {
        try {
          size += chunk.length;
          if (size > MAX_DOCUMENT_BYTES) {
            callback(documentError('DOCUMENT_TOO_LARGE', 'Document exceeds the 10 MB limit.', 413));
            return;
          }
          hash.update(chunk);

          if (mode === null) {
            const need = Math.max(0, 8 - prefix.length);
            if (need) prefix = Buffer.concat([prefix, chunk.subarray(0, need)]);
            const detected = sniffMime(prefix, false);
            if (detected) {
              mode = detected;
            } else if (prefix.length >= 8 || size >= 8) {
              mode = 'text';
              for (const buffered of pendingText) validateText(buffered, true);
              pendingText.length = 0;
              validateText(chunk, true);
            } else {
              pendingText.push(chunk);
            }
          } else if (mode === 'text') {
            validateText(chunk, true);
          }
          callback(null, chunk);
        } catch (error) {
          callback(error);
        }
      },
      flush(callback) {
        if (mode === null) {
          mode = sniffMime(prefix, false) || 'text';
          if (mode === 'text') {
            for (const buffered of pendingText) validateText(buffered, true);
            pendingText.length = 0;
          }
        }
        if (mode === 'text') {
          try {
            validateText(Buffer.alloc(0), false);
          } catch {
            callback(documentError('DOCUMENT_INVALID_TYPE', 'Document is not valid UTF-8 text.', 400));
            return;
          }
        }
        const mime = mode === 'text' ? 'text/plain' : mode;
        if (!size) {
          callback(documentError('DOCUMENT_INVALID_TYPE', 'Document is empty.', 400));
          return;
        }
        if (expectedExtensionMismatch(filename, mime)) {
          callback(documentError('DOCUMENT_INVALID_TYPE', 'File extension does not match the detected file type.', 400));
          return;
        }
        callback();
      },
    }),
    digest: () => hash.digest('hex'),
    get size() {
      return size;
    },
    get mime() {
      return mode === 'text' ? 'text/plain' : mode;
    },
    get prefix() {
      return prefix;
    },
  };
}

export async function storeDocumentStream(stream, filename, { uploadDirectory: configuredDirectory } = {}) {
  const uploadDirectory = await getUploadDirectory(configuredDirectory);
  const storageKey = randomUUID();
  const destination = path.join(uploadDirectory, storageKey);
  const inspector = createInspector(safeFilename(filename));

  try {
    await pipeline(
      stream,
      inspector.transform,
      createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
    );
    const fileInfo = await stat(destination);
    if (fileInfo.size !== inspector.size || !inspector.mime) {
      throw documentError('DOCUMENT_INVALID_TYPE', 'Document file could not be validated.', 400);
    }
    return {
      storageKey,
      filename: safeFilename(filename),
      mime: inspector.mime,
      size: inspector.size,
      sha256: inspector.digest(),
      uploadDirectory,
    };
  } catch (error) {
    await rm(destination, { force: true });
    throw error;
  }
}

export async function readStoredDocument(storageKey, uploadDirectory) {
  if (!STORAGE_KEY_PATTERN.test(storageKey || '')) {
    throw documentError('NOT_FOUND', 'Document file not found.', 404);
  }
  const root = uploadDirectory || await getUploadDirectory();
  return readFile(path.join(root, storageKey));
}

export async function storedDocumentPath(storageKey, uploadDirectory) {
  if (!STORAGE_KEY_PATTERN.test(storageKey || '')) {
    throw documentError('NOT_FOUND', 'Document file not found.', 404);
  }
  const root = uploadDirectory || await getUploadDirectory();
  return path.join(root, storageKey);
}

export async function removeStoredDocument(storageKey, uploadDirectory) {
  const filePath = await storedDocumentPath(storageKey, uploadDirectory);
  await rm(filePath, { force: true });
}

export { documentError, safeFilename };
