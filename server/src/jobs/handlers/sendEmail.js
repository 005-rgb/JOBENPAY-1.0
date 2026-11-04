import { claimAndSendEmail, processOutboxBatch } from '../../email/outbox.js';

export async function sendEmailJob(job, { db } = {}) {
  const outboxId = job.payload?.outboxId;
  if (outboxId) {
    await claimAndSendEmail(outboxId, { db });
  } else {
    await processOutboxBatch(db);
  }
}

