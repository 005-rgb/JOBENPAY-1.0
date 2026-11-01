import { AiError } from './errors.js';

const MAX_ATTEMPTS = 2;

function isRetryableNetworkError(error) {
  return error instanceof TypeError
    || error?.name === 'AbortError'
    || error?.name === 'TimeoutError'
    || ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(error?.code);
}

function retryDelay(attempt) {
  return new Promise((resolve) => setTimeout(resolve, 150 * attempt));
}

export async function fetchJson(url, options, { fetchImpl = fetch, timeoutMs = 20_000 } = {}) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        ...options,
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (!isRetryableNetworkError(error)) {
        throw new AiError('UNAVAILABLE', 'AI provider request failed.', { cause: error });
      }
      if (attempt === MAX_ATTEMPTS) {
        throw new AiError('UNAVAILABLE', 'AI provider is unavailable.', { cause: error });
      }
      await retryDelay(attempt);
      continue;
    }

    if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
      await retryDelay(attempt);
      continue;
    }

    let body;
    try {
      body = await response.text();
    } catch (error) {
      if (isRetryableNetworkError(error) && attempt < MAX_ATTEMPTS) {
        await retryDelay(attempt);
        continue;
      }
      throw new AiError('UNAVAILABLE', 'AI provider response could not be read.', { cause: error });
    }
    let parsed;
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      parsed = {};
    }
    if (!response.ok) {
      const error = new AiError(
        'PROVIDER',
        response.status >= 500 ? 'AI provider is unavailable.' : 'AI provider rejected the request.',
      );
      error.statusCode = response.status;
      error.unsupportedJsonMode = response.status === 400
        && (parsed?.error?.param === 'response_format'
          || /response_format|json_object/i.test(String(parsed?.error?.message || '')));
      throw error;
    }
    return parsed;
  }

  throw new AiError('UNAVAILABLE', 'AI provider is unavailable.');
}
