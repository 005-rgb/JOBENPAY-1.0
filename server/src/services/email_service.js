// @ts-check
import pool from '../db/pool.js';
import { enqueueEmail } from '../email/outbox.js';
import { logger } from '../lib/logger.js';

/**
 * Enqueues an invitation email to be sent to a new member.
 * 
 * @param {string} email
 * @param {string} inviteUrl
 * @param {string|null} [orgId=null]
 * @param {import('pg').PoolClient|null} [client=null]
 * @returns {Promise<any>}
 */
export async function sendInviteEmail(email, inviteUrl, orgId = null, client = null) {
  try {
    const db = client || pool;
    return await enqueueEmail(db, {
      orgId,
      to: email,
      template: 'memberInvite',
      data: { inviteUrl },
    });
  } catch (err) {
    logger.warn({ error: err.message, email }, 'Failed to enqueue invitation email; non-blocking warning');
    return null;
  }
}

export default {
  sendInviteEmail,
};
