import pool from '../../src/db/pool.js';
import app from '../../src/app.js';

const server = app.listen(0, '127.0.0.1', () => {
  process.stdout.write(`PAYPAL_APP_PORT:${server.address().port}\n`);
});

process.once('SIGTERM', () => {
  server.close(() => {
    pool.end().then(() => process.exit(0));
  });
});
