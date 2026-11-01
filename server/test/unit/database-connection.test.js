import assert from 'node:assert/strict';
import test from 'node:test';

import { databaseConnectionOptions } from '../../src/db/connection.js';

test('database connections using sslmode=require verify the server certificate', () => {
  const options = databaseConnectionOptions('postgresql://user:pass@db.example/jobenpay?sslmode=require');

  assert.equal(options.connectionString, 'postgresql://user:pass@db.example/jobenpay?sslmode=require');
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
});

test('database connections using sslmode=verify-full enable certificate verification', () => {
  const options = databaseConnectionOptions('postgresql://user:pass@db.example/jobenpay?sslmode=verify-full');

  assert.equal(options.ssl.rejectUnauthorized, true);
});

test('database connections without an SSL request do not enable TLS implicitly', () => {
  const connectionString = 'postgresql://user:pass@localhost/jobenpay';
  const options = databaseConnectionOptions(connectionString);

  assert.deepEqual(options, { connectionString });
});
