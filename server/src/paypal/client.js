import { URL } from 'node:url';

import { AppError } from '../lib/errors.js';
import { decrypt } from '../lib/crypto.js';
import pool from '../db/pool.js';
import { env } from '../config.js';
import { getPaypalCredentials } from '../repositories/paypalConnections.js';
import { PAYPAL_API_BASE } from './constants.js';

const TOKEN_REFRESH_MARGIN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 200;
const tokenCache = new Map();

function getApiBase() {
  const override = process.env.NODE_ENV === 'test'
    ? process.env.PAYPAL_API_BASE_OVERRIDE
    : undefined;
  return override || PAYPAL_API_BASE;
}

function assertApiPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new TypeError('PayPal API path must be an absolute path on the configured API host.');
  }
  const target = new URL(path, getApiBase());
  if (target.origin !== new URL(getApiBase()).origin) {
    throw new TypeError('PayPal API path cannot change the configured API host.');
  }
  return target;
}

function isRetryableNetworkError(error) {
  return error instanceof TypeError
    || error?.name === 'AbortError'
    || error?.name === 'TimeoutError'
    || error?.code === 'ECONNRESET'
    || error?.code === 'ETIMEDOUT'
    || error?.code === 'EAI_AGAIN';
}

function redactValue(value, secrets) {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, secrets));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      /token|secret|authorization|client[_-]?id|password/i.test(key)
        ? '[REDACTED]'
        : redactValue(item, secrets),
    ]));
  }
  if (typeof value !== 'string') {
    return value;
  }
  return secrets.reduce((redacted, secret) => (
    secret ? redacted.split(secret).join('[REDACTED]') : redacted
  ), value);
}

function parseResponse(text) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: 'PayPal returned a non-JSON response.' };
  }
}

function classifyError(status, response, secrets) {
  const details = {
    status,
    response: redactValue(response, secrets),
  };
  let error;
  if (status === 401 || status === 403) {
    error = new AppError('PAYPAL_AUTH_FAILED', 'PayPal rejected the sandbox credentials.', details);
  } else if (status === 429) {
    error = new AppError('PAYPAL_RATE_LIMITED', 'PayPal rate limit was exceeded.', details);
  } else if (status >= 500) {
    error = new AppError('PAYPAL_UNAVAILABLE', 'PayPal sandbox is temporarily unavailable.', details);
  } else {
    error = new AppError('PAYPAL_REQUEST_REJECTED', 'PayPal rejected the request.', details);
  }
  error.statusCode = status === 429 ? 429 : status >= 400 && status < 500 ? 400 : 503;
  return error;
}

async function waitBeforeRetry(attempt) {
  const maximum = BASE_RETRY_DELAY_MS * (2 ** (attempt - 1));
  const delay = Math.floor(maximum * (0.5 + Math.random()));
  await new Promise((resolve) => setTimeout(resolve, delay));
}

async function fetchWithRetry(url, options, secrets) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response;
    let text;
    try {
      response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      text = await response.text();
    } catch (error) {
      if (!isRetryableNetworkError(error) || attempt === MAX_ATTEMPTS) {
        if (isRetryableNetworkError(error)) {
          const networkError = new AppError('PAYPAL_NETWORK_ERROR', 'Could not reach PayPal sandbox.');
          networkError.statusCode = 503;
          throw networkError;
        }
        throw error;
      }
      await waitBeforeRetry(attempt);
      continue;
    }

    const body = parseResponse(text);
    if (response.ok) {
      return body;
    }
    if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
      await waitBeforeRetry(attempt);
      continue;
    }
    throw classifyError(response.status, body, secrets);
  }

  const networkError = new AppError('PAYPAL_NETWORK_ERROR', 'Could not reach PayPal sandbox.');
  networkError.statusCode = 503;
  throw networkError;
}

function getCachedToken(orgId) {
  const cached = tokenCache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }
  tokenCache.delete(orgId);
  return null;
}

export function clearPaypalTokenCache(orgId) {
  if (orgId) {
    tokenCache.delete(orgId);
  } else {
    tokenCache.clear();
  }
}

export async function paypalFor(orgId, {
  db = pool,
  encryptionKey = env.JOBENPAY_ENC_KEY,
} = {}) {
  if (!orgId) {
    throw new TypeError('orgId is required to load PayPal credentials.');
  }
  const credentials = await getPaypalCredentials(orgId, db);
  if (!credentials?.client_id_enc || !credentials.client_secret_enc) {
    throw new AppError('PAYPAL_NOT_CONFIGURED', 'PayPal sandbox credentials are not configured.');
  }
  if (!encryptionKey) {
    throw new AppError('PAYPAL_ENCRYPTION_KEY_MISSING', 'PayPal credentials cannot be decrypted.');
  }

  const clientId = decrypt({
    key: encryptionKey,
    payload: credentials.client_id_enc,
    aad: `paypal_connections:client_id_enc:${orgId}`,
  });
  const clientSecret = decrypt({
    key: encryptionKey,
    payload: credentials.client_secret_enc,
    aad: `paypal_connections:client_secret_enc:${orgId}`,
  });
  const basicCredentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const secrets = [clientId, clientSecret, basicCredentials, `Basic ${basicCredentials}`];

  async function accessToken() {
    const cachedToken = getCachedToken(orgId);
    if (cachedToken) {
      return cachedToken;
    }

    const url = assertApiPath('/v1/oauth2/token');
    const result = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        authorization: `Basic ${basicCredentials}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    }, secrets);
    if (typeof result?.access_token !== 'string' || !Number.isFinite(Number(result.expires_in))) {
      throw new AppError('PAYPAL_INVALID_TOKEN_RESPONSE', 'PayPal returned an invalid OAuth response.');
    }

    const expiresAt = Date.now() + Math.max(0, Number(result.expires_in) * 1000 - TOKEN_REFRESH_MARGIN_MS);
    if (expiresAt > Date.now()) {
      tokenCache.set(orgId, { accessToken: result.access_token, expiresAt });
    }
    return result.access_token;
  }

  return {
    async testConnection() {
      await accessToken();
      return true;
    },
    async request(method, path, {
      body,
      headers = {},
      idempotencyId,
    } = {}) {
      const url = assertApiPath(path);
      const token = await accessToken();
      const requestHeaders = new globalThis.Headers(headers);
      requestHeaders.set('authorization', `Bearer ${token}`);
      if (body !== undefined) {
        requestHeaders.set('content-type', 'application/json');
      }
      if (idempotencyId) {
        requestHeaders.set('PayPal-Request-Id', idempotencyId);
      }

      const responseBody = await fetchWithRetry(url, {
        method: String(method).toUpperCase(),
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
      }, [...secrets, token, `Bearer ${token}`]);
      return responseBody;
    },
  };
}
