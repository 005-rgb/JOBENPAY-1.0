let csrfToken = '';

export function setCsrfToken(token) {
  csrfToken = token || '';
}

export class ApiError extends Error {
  constructor({ code = 'NETWORK_ERROR', message = 'The request could not be completed.', details = null, status = 0 }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, headers = {}, stepUpGrant } = {}) {
  const requestHeaders = new Headers(headers);
  const upperMethod = method.toUpperCase();
  if (body !== undefined) requestHeaders.set('content-type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(upperMethod) && csrfToken) {
    requestHeaders.set('x-csrf-token', csrfToken);
  }
  if (stepUpGrant) requestHeaders.set('x-step-up-grant', stepUpGrant);

  let response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method: upperMethod,
      credentials: 'same-origin',
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError({});
  }

  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    const source = payload?.error || payload || {};
    throw new ApiError({
      code: source.code || 'REQUEST_FAILED',
      message: source.message || 'The request could not be completed.',
      details: source.details || null,
      status: response.status,
    });
  }
  return payload;
}

export const apiClient = {
  get: (path, options) => request(path, options),
  post: (path, body, options = {}) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options = {}) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options = {}) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, body, options = {}) => request(path, { ...options, method: 'DELETE', body }),
};
