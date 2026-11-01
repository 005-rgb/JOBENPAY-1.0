import { env } from '../config.js';

export function databaseConnectionOptions(connectionString = env.DATABASE_URL) {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get('sslmode')?.toLowerCase();
  const sslEnabled = url.searchParams.get('ssl')?.toLowerCase() === 'true'
    || ['require', 'verify-ca', 'verify-full'].includes(sslMode);

  if (!sslEnabled) {
    return { connectionString };
  }

  return {
    connectionString,
    ssl: {
      rejectUnauthorized: true,
      ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA } : {}),
    },
  };
}
