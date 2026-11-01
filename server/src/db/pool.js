import pg from 'pg';
import { env } from '../config.js';
import { databaseConnectionOptions } from './connection.js';

const { Pool } = pg;

pg.types.setTypeParser(20, 'text', String);

const pool = new Pool({
  ...databaseConnectionOptions(env.DATABASE_URL),
  max: 5,
  statement_timeout: 10000,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const query = (text, params) => pool.query(text, params);
export default pool;
