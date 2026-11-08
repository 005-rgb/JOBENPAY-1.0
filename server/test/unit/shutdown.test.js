// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupGracefulShutdown } from '../../src/shutdown.js';
import { Worker } from '../../src/jobs/worker.js';

test('test_worker_pause', () => {
  const worker = new Worker();
  assert.equal(worker.paused, false);
  assert.equal(worker.isAlive(), true);
  worker.pause();
  assert.equal(worker.paused, true);
  assert.equal(worker.isAlive(), false);
});

test('test_worker_drain', async () => {
  const worker = new Worker();
  let completed = false;
  const dummyJob = { id: 'job_test_drain', type: 'noop' };

  const promise = worker.processJob(dummyJob);
  assert.equal(worker.activeJobs.size, 1);
  
  // Start draining in background
  const drainPromise = worker.drain().then(() => {
    completed = true;
  });

  await promise;
  assert.equal(worker.activeJobs.size, 0);
  await drainPromise;
  assert.equal(completed, true);
});

test('test_graceful_shutdown_timeout', async () => {
  let exitCode = null;
  const mockServer = {
    close: (cb) => { if (cb) cb(); },
  };
  const mockWorker = {
    pause: () => {},
    drain: () => new Promise((resolve) => setTimeout(resolve, 500)), // slow drain
  };
  const mockPool = {
    end: async () => {},
  };

  const { shutdown } = setupGracefulShutdown(mockServer, {
    timeoutMs: 50, // very short timeout to trigger timeout branch
    pool: mockPool,
    worker: mockWorker,
    exit: (code) => { exitCode = code; },
    registerSignals: false,
  });

  await shutdown('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(exitCode, 1);
});

test('test_graceful_shutdown_timeout_with_error', async () => {
  let exitCode = null;
  const mockWorker = {
    pause: () => {},
    drain: async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      throw new Error('Late drain error');
    },
  };
  const mockPool = {
    end: async () => {},
  };

  const { shutdown } = setupGracefulShutdown(null, {
    timeoutMs: 30,
    pool: mockPool,
    worker: mockWorker,
    exit: (code) => { exitCode = code; },
    registerSignals: false,
  });

  await shutdown('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(exitCode, 1);
});

test('test_graceful_shutdown_success', async () => {
  let exitCode = null;
  let serverClosed = false;
  let workerPaused = false;
  let workerDrained = false;
  let poolEnded = false;

  const mockServer = {
    close: (cb) => {
      serverClosed = true;
      if (cb) cb();
    },
  };
  const mockWorker = {
    pause: () => { workerPaused = true; },
    drain: async () => { workerDrained = true; },
  };
  const mockPool = {
    end: async () => { poolEnded = true; },
  };

  const { shutdown, isShuttingDown } = setupGracefulShutdown(mockServer, {
    timeoutMs: 5000,
    pool: mockPool,
    worker: mockWorker,
    exit: (code) => { exitCode = code; },
    registerSignals: false,
  });

  assert.equal(isShuttingDown(), false);
  await shutdown('SIGTERM');
  assert.equal(isShuttingDown(), true);

  assert.equal(serverClosed, true);
  assert.equal(workerPaused, true);
  assert.equal(workerDrained, true);
  assert.equal(poolEnded, true);
  assert.equal(exitCode, 0);

  // Second invocation should warn and return early
  await shutdown('SIGINT');
});

test('test_graceful_shutdown_error_handling', async () => {
  let exitCode = null;
  const mockServer = {
    close: (cb) => { if (cb) cb(); },
  };
  const mockWorker = {
    pause: () => {},
    drain: async () => {
      throw new Error('Drain exploded');
    },
  };

  const { shutdown } = setupGracefulShutdown(mockServer, {
    timeoutMs: 5000,
    worker: mockWorker,
    exit: (code) => { exitCode = code; },
    registerSignals: false,
  });

  await shutdown('SIGTERM');
  assert.equal(exitCode, 1);
});

test('test_graceful_shutdown_default_options', async () => {
  let exitCalled = false;
  const dummyWorker = new Worker();
  dummyWorker.pause();
  const dummyPool = { end: async () => {} };

  // Exercise default options where server is null, timeoutMs is default, pool & worker are default
  const { shutdown } = setupGracefulShutdown(null, {
    pool: dummyPool,
    worker: dummyWorker,
    exit: () => { exitCalled = true; },
  });

  await shutdown();
  assert.equal(exitCalled, true);
});

test('test_graceful_shutdown_signal_listeners', () => {
  // Test setup with registerSignals: true (default)
  const listenersBeforeTerm = process.listenerCount('SIGTERM');
  const listenersBeforeInt = process.listenerCount('SIGINT');

  const instance = setupGracefulShutdown(null, {
    exit: () => {},
  });

  assert.equal(process.listenerCount('SIGTERM'), listenersBeforeTerm + 1);
  assert.equal(process.listenerCount('SIGINT'), listenersBeforeInt + 1);

  // Trigger signal handlers
  process.emit('SIGTERM');
  process.emit('SIGINT');
  assert.equal(instance.isShuttingDown(), true);
});

test('test_graceful_shutdown_default_exit', () => {
  const origExit = process.exit;
  try {
    process.exit = () => {};
    const instance = setupGracefulShutdown(null, { registerSignals: false });
    assert.equal(typeof instance.shutdown, 'function');
  } finally {
    process.exit = origExit;
  }
});
