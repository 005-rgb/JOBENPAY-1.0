import pool from '../db/pool.js';
import { reevaluateStaleRequest } from '../services/requests.js';

export async function evaluateRequestJob(job, { db = pool } = {}) {
  return reevaluateStaleRequest(job.payload.orgId, job.payload.requestId, db);
}
