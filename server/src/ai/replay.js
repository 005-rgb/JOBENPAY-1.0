import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '../../../shared/canonical.js';
import { AiError } from './errors.js';

const RECORDINGS_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../test/ai-eval/recordings',
);

export function recordingHash(input) {
  return createHash('sha256').update(canonicalJson(input)).digest('hex');
}

export function recordingPath(task, input, recordingsDirectory = RECORDINGS_DIRECTORY) {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(task)) {
    throw new AiError('TASK', 'Unsupported AI task.');
  }
  return path.join(recordingsDirectory, task, `${recordingHash(input)}.json`);
}

export async function replayStructured(task, input, { recordingsDirectory = RECORDINGS_DIRECTORY } = {}) {
  let contents;
  try {
    contents = await readFile(recordingPath(task, input, recordingsDirectory), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new AiError('NO_RECORDING', 'No replay recording exists for this input.');
    }
    throw new AiError('REPLAY', 'AI replay recording could not be read.', { cause: error });
  }

  try {
    const recording = JSON.parse(contents);
    if (!recording || !Object.hasOwn(recording, 'result')) {
      throw new Error('Recording is missing result.');
    }
    return {
      content: JSON.stringify(recording.result),
      usage: {
        inputTokens: Number(recording.usage?.inputTokens || 0),
        outputTokens: Number(recording.usage?.outputTokens || 0),
      },
    };
  } catch (error) {
    throw new AiError('INVALID_OUTPUT', 'AI replay recording is invalid.', { cause: error });
  }
}
