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
  upload: (path, file, onProgress) => new Promise((resolve, reject) => {
    const xhr = new globalThis.XMLHttpRequest();
    xhr.open('POST', `/api/v1${path}`);
    xhr.withCredentials = true;
    if (csrfToken) xhr.setRequestHeader('x-csrf-token', csrfToken);
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener('load', () => {
      let payload = null;
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        reject(new ApiError({ code: 'INVALID_RESPONSE', message: 'The server returned an invalid response.', status: xhr.status }));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300 || payload?.ok === false) {
        const source = payload?.error || payload || {};
        reject(new ApiError({
          code: source.code || 'REQUEST_FAILED',
          message: source.message || 'The request could not be completed.',
          details: source.details || null,
          status: xhr.status,
        }));
        return;
      }
      resolve(payload);
    });
    xhr.addEventListener('error', () => reject(new ApiError({})));
    xhr.addEventListener('abort', () => reject(new ApiError({ code: 'UPLOAD_ABORTED', message: 'The upload was cancelled.' })));
    const formData = new FormData();
    formData.append('file', file, file.name);
    xhr.send(formData);
  }),
};
