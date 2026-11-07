/**
 * fake-paypal/failure-modes.js
 * Mode kegagalan terprogram untuk Fake PayPal Server.
 * 
 * Mendukung injeksi:
 * 1. 429 Rate Limit (+ Retry-After header)
 * 2. 5xx Internal / Service Unavailable
 * 3. Latency / Timeout delay
 * 4. Gagal pada pemanggilan ke-N (failOnAttempt)
 * 5. Webhook delivery modes: out-of-order, duplicate, invalid-signature
 */

class FailureInjector {
  constructor() {
    this.rules = [];
    this.counters = new Map(); // key -> attempt count
    this.webhookMode = 'normal'; // 'normal' | 'out-of-order' | 'duplicate' | 'invalid-signature'
  }

  reset() {
    this.rules = [];
    this.counters.clear();
    this.webhookMode = 'normal';
  }

  setWebhookMode(mode) {
    this.webhookMode = mode;
  }

  getWebhookMode() {
    return this.webhookMode;
  }

  /**
   * Menambahkan aturan kegagalan
   * @param {Object} rule
   * @param {string} [rule.method] - GET, POST, etc. (opsional)
   * @param {string|RegExp} [rule.path] - Path yang dicocokkan
   * @param {number} [rule.statusCode] - 429, 500, 503, etc.
   * @param {Object} [rule.headers] - Headers tambahan, misal { 'Retry-After': '5' }
   * @param {Object|string} [rule.body] - Body error
   * @param {number} [rule.delayMs] - Waktu tunggu sebelum respons
   * @param {number} [rule.failOnAttempt] - Hanya gagal pada panggilan ke-N
   * @param {number} [rule.maxFailures] - Maksimal berapa kali gagal sebelum kembali sukses
   */
  addRule(rule) {
    this.rules.push({
      id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      method: rule.method ? rule.method.toUpperCase() : null,
      path: rule.path || null,
      statusCode: rule.statusCode || 500,
      headers: rule.headers || {},
      body: rule.body || { name: 'INTERNAL_SERVER_ERROR', message: 'Simulated failure' },
      delayMs: rule.delayMs || 0,
      failOnAttempt: rule.failOnAttempt || null,
      maxFailures: rule.maxFailures || Infinity,
      triggeredCount: 0
    });
  }

  /**
   * Mengecek apakah request saat ini harus digagalkan
   */
  async evaluate(method, pathname) {
    const key = `${method.toUpperCase()}:${pathname}`;
    const attempt = (this.counters.get(key) || 0) + 1;
    this.counters.set(key, attempt);

    for (const rule of this.rules) {
      if (rule.triggeredCount >= rule.maxFailures) continue;

      if (rule.method && rule.method !== method.toUpperCase()) continue;

      if (rule.path) {
        if (rule.path instanceof RegExp) {
          if (!rule.path.test(pathname)) continue;
        } else if (typeof rule.path === 'string') {
          if (!pathname.startsWith(rule.path) && pathname !== rule.path) continue;
        }
      }

      // Cek pemanggilan ke-N
      if (rule.failOnAttempt && attempt !== rule.failOnAttempt) {
        continue;
      }

      // Aturan cocok!
      rule.triggeredCount++;

      if (rule.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, rule.delayMs));
      }

      return {
        matched: true,
        statusCode: rule.statusCode,
        headers: {
          'content-type': 'application/json',
          ...rule.headers
        },
        body: rule.body
      };
    }

    return null;
  }
}

export const failureInjector = new FailureInjector();

