import test from 'node:test';
import assert from 'node:assert/strict';

import { AppError, errorHandler } from '../../src/lib/errors.js';

function responseCapture() {
  return {
    statusCode: undefined,
    body: undefined,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('errorHandler hides internal error messages and stack traces', () => {
  const response = responseCapture();

  errorHandler(new Error('database password leaked'), { id: 'request-1' }, response, assert.fail);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, {
    error: {
      code: 'INTERNAL',
      message: 'Internal server error.',
      requestId: 'request-1',
      details: undefined,
    },
  });
  assert.equal(JSON.stringify(response.body).includes('database password leaked'), false);
  assert.equal(JSON.stringify(response.body).includes('stack'), false);
});

test('errorHandler preserves safe AppError details', () => {
  const response = responseCapture();
  const forbidden = new AppError('FORBIDDEN', 'Not allowed.', { reason: 'role' });
  forbidden.statusCode = 403;

  errorHandler(forbidden, { id: 'request-2' }, response, assert.fail);

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error.code, 'FORBIDDEN');
  assert.equal(response.body.error.message, 'Not allowed.');
  assert.deepEqual(response.body.error.details, { reason: 'role' });
});
