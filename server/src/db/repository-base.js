/**
 * server/src/db/repository-base.js
 * Repositori dasar ber-tenant (TenantRepository) dengan penegakan isolasi tenant multi-organisasi.
 * 
 * Aturan Pagar:
 * 1. Seluruh operasi wajib menerima `orgId` sebagai argumen pertama/eksplisit.
 * 2. Pemanggilan tanpa `orgId` (null, undefined, atau string kosong) melempar TenantIsolationError saat runtime.
 * 3. Menolak eksekusi query SELECT/UPDATE/DELETE pada tabel tenant yang tidak menyertakan 'org_id'.
 * 4. Daftar putih tabel global (GLOBAL_TABLES_WHITELIST) dikecualikan secara eksplisit.
 */

import pool from './pool.js';

export class TenantIsolationError extends Error {
  constructor(message = 'Tenant isolation violation: orgId is required for repository operations') {
    super(message);
    this.name = 'TenantIsolationError';
    this.code = 'TENANT_ISOLATION_VIOLATION';
    this.statusCode = 400;
  }
}

export const GLOBAL_TABLES_WHITELIST = Object.freeze([
  'schema_migrations',
  'users',
  'jobs'
]);

export class TenantRepository {
  /**
   * @param {string} tableName - Nama tabel PostgreSQL
   * @param {Object} [defaultDb=pool] - Pool atau Client PostgreSQL
   */
  constructor(tableName, defaultDb = pool) {
    if (!tableName || typeof tableName !== 'string') {
      throw new TypeError('tableName is required for TenantRepository');
    }
    this.tableName = tableName;
    this.defaultDb = defaultDb;
  }

  /**
   * Memvalidasi bahwa orgId diberikan dan tidak kosong
   * @param {string} orgId
   * @returns {string} orgId yang tervalidasi
   */
  assertOrgId(orgId) {
    if (!orgId || typeof orgId !== 'string' || orgId.trim() === '') {
      throw new TenantIsolationError(
        `orgId is required for tenant repository operation on '${this.tableName}'. Received: ${JSON.stringify(orgId)}`
      );
    }
    return orgId.trim();
  }

  /**
   * Mengeksekusi query terisolasi dengan validasi bahwa org_id disertakan
   */
  async query(orgId, text, params = [], client = this.defaultDb) {
    const validOrgId = this.assertOrgId(orgId);

    const isGlobal = GLOBAL_TABLES_WHITELIST.includes(this.tableName);
    if (!isGlobal && !text.toLowerCase().includes('org_id')) {
      throw new TenantIsolationError(
        `Tenant isolation violation: query on tenant table '${this.tableName}' must contain 'org_id' condition. Query: ${text}`
      );
    }

    return client.query(text, params);
  }

  /**
   * Mengambil satu baris berdasarkan id dan org_id
   */
  async findById(orgId, id, client = this.defaultDb) {
    const validOrgId = this.assertOrgId(orgId);
    if (!id) return null;

    const res = await client.query(
      `SELECT * FROM ${this.tableName} WHERE org_id = $1 AND id = $2 LIMIT 1`,
      [validOrgId, id]
    );
    return res.rows[0] || null;
  }

  /**
   * Mengambil daftar baris terpaginasi untuk orgId
   */
  async list(orgId, options = {}, client = this.defaultDb) {
    const validOrgId = this.assertOrgId(orgId);
    const limit = Math.min(Math.max(1, Number(options.limit) || 50), 200);
    const offset = Math.max(0, Number(options.offset) || 0);

    const res = await client.query(
      `SELECT * FROM ${this.tableName} WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [validOrgId, limit, offset]
    );
    return res.rows;
  }

  /**
   * Menghapus baris berdasarkan id dan org_id
   */
  async deleteById(orgId, id, client = this.defaultDb) {
    const validOrgId = this.assertOrgId(orgId);
    if (!id) return null;

    const res = await client.query(
      `DELETE FROM ${this.tableName} WHERE org_id = $1 AND id = $2 RETURNING *`,
      [validOrgId, id]
    );
    return res.rows[0] || null;
  }
}

export default TenantRepository;

