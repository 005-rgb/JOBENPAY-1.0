function assertOrgId(orgId) {
  if (!orgId) {
    throw new Error('orgId is required for webhook event repository methods.');
  }
}

export async function insertVerifiedWebhookEvent(tx, { orgId, event }) {
  assertOrgId(orgId);
  if (!tx || typeof tx.query !== 'function') {
    throw new TypeError('A transaction is required to insert a webhook event.');
  }
  const result = await tx.query(`
    INSERT INTO webhook_events (
      org_id, paypal_event_id, event_type, payload, verified, status, received_at
    )
    VALUES ($1, $2, $3, $4, true, 'PENDING', now())
    ON CONFLICT (paypal_event_id) DO NOTHING
    RETURNING id
  `, [orgId, event.id, event.event_type, event]);
  return result.rowCount === 1;
}

export async function markWebhookReceived(orgId, eventId, db) {
  assertOrgId(orgId);
  if (!eventId || !db || typeof db.query !== 'function') {
    throw new TypeError('eventId and database are required to update a webhook event.');
  }
  const result = await db.query(`
    UPDATE webhook_events
    SET status = 'RECEIVED'
    WHERE org_id = $1 AND paypal_event_id = $2 AND verified = true
    RETURNING id
  `, [orgId, eventId]);
  return result.rowCount;
}
