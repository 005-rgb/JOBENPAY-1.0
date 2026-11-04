import assert from 'node:assert/strict';
import test from 'node:test';
import { updateTickHeartbeat, getProcessorHealth } from '../../src/jobs/tick.js';

test('updateTickHeartbeat writes _tick_heartbeat to jobs table', async () => {
  let executedSql = '';
  const mockDb = {
    async query(sql) {
      executedSql = sql;
      return { rowCount: 1 };
    },
  };

  await updateTickHeartbeat(mockDb);
  assert.ok(executedSql.includes('_tick_heartbeat'));
  assert.ok(executedSql.includes('"process":"tick"'));
});

test('getProcessorHealth parses ages and job counts accurately', async () => {
  const mockDb = {
    async query() {
      return {
        rows: [{
          worker_heartbeat_age_sec: 15,
          tick_heartbeat_age_sec: 45,
          oldest_pending_job_age_sec: 120,
          dead_jobs: 2,
        }],
      };
    },
  };

  const health = await getProcessorHealth(mockDb);
  assert.equal(health.workerHeartbeatAgeSec, 15);
  assert.equal(health.tickHeartbeatAgeSec, 45);
  assert.equal(health.oldestPendingJobAgeSec, 120);
  assert.equal(health.deadJobs, 2);
});

test('getProcessorHealth handles null / empty states gracefully', async () => {
  const mockDb = {
    async query() {
      return {
        rows: [{
          worker_heartbeat_age_sec: null,
          tick_heartbeat_age_sec: null,
          oldest_pending_job_age_sec: null,
          dead_jobs: null,
        }],
      };
    },
  };

  const health = await getProcessorHealth(mockDb);
  assert.equal(health.workerHeartbeatAgeSec, null);
  assert.equal(health.tickHeartbeatAgeSec, null);
  assert.equal(health.oldestPendingJobAgeSec, 0);
  assert.equal(health.deadJobs, 0);
});

