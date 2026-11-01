import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { env } from '../config.js';
import { PROMPTS } from './prompts/index.js';
import { sanitizeAiInput } from './prompts/shared.js';
import { recordingHash, recordingPath, replayStructured } from './replay.js';
import { AiError, toAiError } from './errors.js';
import { generateAnthropic } from './anthropic.js';
import { generateOpenAI } from './openai.js';
import { reserveAiUsage } from './usage.js';

const RECORDINGS_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../test/ai-eval/recordings',
);

function decodeJson(content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new AiError('INVALID_OUTPUT', 'AI provider returned invalid JSON.', { cause: error });
  }
}

async function writeRecording(task, input, result, usage) {
  if (process.env.AI_RECORD !== '1') return;
  if (env.NODE_ENV !== 'development') {
    throw new AiError('RECORDING_DISABLED', 'AI recording is only allowed in development.');
  }
  const target = recordingPath(task, input, RECORDINGS_DIRECTORY);
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(temporary, `${JSON.stringify({ result, usage }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await rename(temporary, target);
  } catch (error) {
    throw new AiError('RECORDING', 'AI replay recording could not be written.', { cause: error });
  }
}

function assertTask(task) {
  const prompt = PROMPTS[task];
  if (!prompt || typeof prompt.buildPrompt !== 'function') {
    throw new AiError('TASK', 'Unsupported AI task.');
  }
  return prompt;
}

function providerFor(provider) {
  if (provider === 'anthropic') return generateAnthropic;
  if (provider === 'openai') return generateOpenAI;
  if (provider === 'replay') return replayStructured;
  throw new AiError('CONFIG', 'AI provider configuration is invalid.');
}

export async function generateStructured({
  task,
  schema,
  input,
  orgId,
}, {
  provider = env.AI_PROVIDER,
  reserveUsage = reserveAiUsage,
  runProvider,
  recordingsDirectory,
} = {}) {
  let reservation;
  let resultUsage = { inputTokens: 0, outputTokens: 0 };
  let settled = false;
  try {
    if (process.env.AI_RECORD === '1' && env.NODE_ENV !== 'development') {
      throw new AiError('RECORDING_DISABLED', 'AI recording is only allowed in development.');
    }
    const promptDefinition = assertTask(task);
    if (!schema || typeof schema.safeParse !== 'function') {
      throw new AiError('SCHEMA', 'A Zod schema is required for structured AI output.');
    }
    const prompt = promptDefinition.buildPrompt(sanitizeAiInput(input));
    const promptBytes = Buffer.byteLength(`${prompt.system}\n${prompt.user}`, 'utf8');
    reservation = await reserveUsage(orgId, task, promptBytes);

    const response = provider === 'replay'
      ? await replayStructured(task, input, { recordingsDirectory })
      : runProvider
        ? await runProvider({ provider, prompt, task, input })
        : await providerFor(provider)(prompt);
    resultUsage = response.usage || resultUsage;
    const value = decodeJson(response.content);
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new AiError('INVALID_OUTPUT', 'AI output did not match the required schema.', {
        cause: parsed.error,
      });
    }
    await writeRecording(task, input, parsed.data, resultUsage);
    await reservation.settle(resultUsage);
    settled = true;
    return parsed.data;
  } catch (error) {
    const aiError = toAiError(error);
    if (reservation && !settled) {
      try {
        await reservation.settle(resultUsage);
      } catch (settleError) {
        throw toAiError(settleError);
      }
    }
    throw aiError;
  }
}

export { AiError, recordingHash };
