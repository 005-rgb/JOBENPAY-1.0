import { startWorker } from '../../src/jobs/worker.js';
import { registerHandler } from '../../src/jobs/registry.js';

const targetJobId = process.env.JOB_TEST_JOB_ID;
const mode = process.env.JOB_TEST_MODE;

registerHandler('execute_request', async (job) => {
  if (job.id !== targetJobId) {
    return;
  }

  process.stdout.write('TARGET_JOB_STARTED\n');
  if (mode === 'hold') {
    await new Promise(() => {});
  }
  if (mode === 'throw') {
    throw new Error('test handler failure');
  }
});
registerHandler('cleanup', async () => {});

startWorker({
  pollIntervalMs: 20,
  pollJitterMs: 0,
  heartbeatIntervalMs: 1000,
});
