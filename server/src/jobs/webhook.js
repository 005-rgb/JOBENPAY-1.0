import { markWebhookReceived } from '../repositories/webhookEvents.js';

export async function processWebhook(job, { db }) {
  const updated = await markWebhookReceived(job.payload?.orgId, job.payload?.eventId, db);
  if (updated !== 1) {
    throw new Error(`Verified webhook event ${job.payload?.eventId} was not found.`);
  }
}
