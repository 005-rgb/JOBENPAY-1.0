import pg from 'pg';
import { env } from '../config.js';

const { Pool } = pg;

pg.types.setTypeParser(20, 'text', String);

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 5,
  statement_timeout: 10000,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: /^postgres(ql)?s?:\/\//i.test(env.DATABASE_URL) && /sslmode=require|ssl=true/i.test(env.DATABASE_URL)
    ? { rejectUnauthorized: false }
    : undefined,
});

export const query = (text, params) => pool.query(text, params);
export default pool;
