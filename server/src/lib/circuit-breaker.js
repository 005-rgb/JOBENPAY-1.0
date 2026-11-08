// @ts-check
import { logger } from './logger.js';

export class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 30000; // 30s
    this.resetTimeout = options.resetTimeout || 60000; // 60s

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = Date.now();
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`Circuit ${this.name} is OPEN`);
      }
      this.state = 'HALF_OPEN';
    }

    let timerId;
    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) => {
          timerId = setTimeout(() => reject(new Error('Timeout')), this.timeout);
          if (typeof timerId.unref === 'function') timerId.unref();
        }),
      ]);
      if (timerId) clearTimeout(timerId);
      this.onSuccess();
      return result;
    } catch (err) {
      if (timerId) clearTimeout(timerId);
      this.onFailure();
      throw err;
    }
  }

  onSuccess() {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.state = 'CLOSED';
        this.successes = 0;
        logger.info({ name: this.name }, 'Circuit CLOSED');
      }
    }
  }

  onFailure() {
    this.failures++;
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
      logger.warn({ name: this.name, failures: this.failures }, 'Circuit OPEN');
    }
  }

  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = Date.now();
  }

  getState() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      next_attempt: new Date(this.nextAttempt).toISOString(),
    };
  }
}

// Circuit breaker registry
const breakers = new Map();

export function getCircuitBreaker(name, options) {
  if (!breakers.has(name)) {
    breakers.set(name, new CircuitBreaker(name, options));
  }
  return breakers.get(name);
}

export function getAllCircuitBreakers() {
  return Array.from(breakers.values()).map((b) => b.getState());
}
