# PRD 1.9 — JOBENPAY Production Operations Layer
## Operational Readiness for Real-World Deployment

**Versi:** 1.0 · **Status:** Implementation-ready, Zero-Hallucination  
**Tanggal:** 7 November 2026  
**Basis:** PRD 1.2–1.8 (semua layer fungsional selesai)  
**Prinsip:** Setiap endpoint, konfigurasi, dan test case eksplisit. AI builder tidak perlu menebak. Tidak ada "disiratkan".  
**Tujuan:** Membuat JOBENPAY tidak hanya "secara konsep matang" tetapi juga "siap beroperasi" di lingkungan produksi dengan SLO terukur, observability lengkap, dan prosedur insiden yang teruji.

---

## 0. ATURAN EMAS (NON-NEGOTIABLE)

1. **Setiap SLO memiliki SLI yang terukur.** Tidak ada SLO tanpa metrik.
2. **Setiap alert memiliki runbook.** Tidak ada alert yang tidak dapat ditindaklanjuti.
3. **Setiap kegagalan memiliki circuit breaker.** Tidak ada panggilan eksternal tanpa timeout.
4. **Setiap perubahan memiliki rollback plan yang diuji.** Tidak ada deploy tanpa rollback.
5. **Setiap secret memiliki rotasi.** Tidak ada secret permanen.
6. **Setiap pengecualian memiliki expiry.** Tidak ada "TODO" tanpa tanggal.
7. **Coverage 100%** untuk modul baru (`slo_service.js`, `circuit-breaker.js`, `shutdown.js`, `secret_rotation.js`). CI gagal jika < 100%.
8. **Setiap test case memiliki assertion eksplisit** (§9). Tidak ada "test bahwa X berfungsi".

---

## 1. RINGKASAN DAN FILOSOFI

### 1.1 Masalah yang Diselesaikan

PRD 1.2–1.8 membangun sistem yang **secara fungsional lengkap**: mandat, gerbang deterministik, ledger, verifikasi lintas organisasi, DIP, CPL, JPL. Tetapi sistem ini **belum siap produksi** karena:

1. **Tidak ada SLO terukur.** Tim tidak tahu apakah sistem "sehat" atau tidak.
2. **Tidak ada graceful shutdown.** Restart dapat menyebabkan status `EXECUTING` menggantung.
3. **Tidak ada circuit breaker.** Jika PayPal lambat, JOBENPAY ikut menggantung.
4. **Tidak ada per-tenant dashboard.** Support tidak dapat mendiagnosis masalah tenant dalam hitungan detik.
5. **Tidak ada runbook.** On-call engineer tidak tahu apa yang harus dilakukan saat insiden.
6. **Tidak ada rollback teruji.** Rollback plan hanya ada di dokumen, tidak pernah dijalankan.
7. **Tidak ada rotasi secret.** Secret permanen adalah risiko keamanan.
8. **Tidak ada load test realistis.** Kapasitas tidak divalidasi.

### 1.2 Solusi: Production Operations Layer

PRD 1.9 menambahkan **lapisan operasional** yang mencakup:

1. **SLO/SLI Framework** — metrik keandalan yang terukur.
2. **Graceful Shutdown** — menyelesaikan request yang sedang berjalan sebelum keluar.
3. **Circuit Breaker** — mencegah cascade failure.
4. **Observability** — per-tenant dashboard, audit log queryable, distributed tracing.
5. **Runbook** — prosedur eksplisit untuk setiap insiden.
6. **Deployment Readiness** — rollback teruji, canary release, exception tracking.
7. **Secret Management** — rotasi tanpa downtime.
8. **Load Testing** — validasi kapasitas pada 2x peak traffic.

### 1.3 Filosofi

> **"Sistem yang tidak dapat dioperasikan bukanlah sistem. Itu adalah prototipe."**

PRD 1.9 mengubah JOBENPAY dari **prototipe** menjadi **sistem produksi** yang dapat diandalkan, diamati, dan dipulihkan.

---

## 2. CAKUPAN

### 2.1 Yang Termasuk

| Komponen | Deskripsi | Tier |
|---|---|---|
| **SLO/SLI Framework** | Definisi SLI, SLO, Error Budget | A |
| **Graceful Shutdown** | SIGTERM handling, connection draining | A |
| **Health Checks** | `/healthz`, `/readyz`, `/startupz` | A |
| **Circuit Breaker** | Untuk PayPal, LLM, DB | A |
| **Per-Tenant Dashboard** | Metrik per tenant | A |
| **Audit Log Queryable** | Pencarian audit log | A |
| **Distributed Tracing** | OpenTelemetry integration | B |
| **Runbook** | Prosedur insiden | A |
| **Rollback Plan** | Prosedur rollback teruji | A |
| **Canary Release** | Deploy bertahap | B |
| **Exception Tracking** | Pengecualian dengan expiry | A |
| **Secret Rotation** | Rotasi tanpa downtime | A |
| **Load Testing** | 2x peak traffic | A |

### 2.2 Yang Tidak Termasuk

- Bukan pengganti PRD 1.2–1.8 (layer fungsional).
- Bukan SOC 2 / ISO 27001 certification (hanya roadmap).
- Bukan chaos engineering penuh (hanya fault injection terbatas).

---

## 3. SLO/SLI FRAMEWORK

### 3.1 Definisi SLI (Service Level Indicator)

**File:** `shared/sli-definitions.js`

```javascript
// @ts-check

/**
 * Setiap SLI memiliki:
 * - id: identifier unik
 * - name: nama manusiawi
 * - description: deskripsi
 * - metric: query Prometheus/PostgreSQL
 * - unit: unit (ms, %, count)
 * - good_event: kondisi "good"
 * - valid_event: kondisi "valid"
 */
export const SLI_DEFINITIONS = [
  {
    id: 'sli_decision_latency',
    name: 'Decision Latency',
    description: 'Persentase keputusan yang selesai < 500ms',
    metric: 'histogram_quantile(0.95, rate(jp_decision_duration_seconds_bucket[5m]))',
    unit: 'ms',
    good_event: 'duration < 0.5',
    valid_event: 'all_decisions'
  },
  {
    id: 'sli_decision_availability',
    name: 'Decision Availability',
    description: 'Persentase request keputusan yang berhasil (tidak 5xx)',
    metric: 'sum(rate(jp_decision_total{status!~"5.."}[5m])) / sum(rate(jp_decision_total[5m]))',
    unit: '%',
    good_event: 'status != 5xx',
    valid_event: 'all_requests'
  },
  {
    id: 'sli_payout_success',
    name: 'Payout Success Rate',
    description: 'Persentase payout yang berhasil (RECONCILED) dalam 5 menit',
    metric: 'sum(rate(jp_payout_total{status="RECONCILED"}[5m])) / sum(rate(jp_payout_total[5m]))',
    unit: '%',
    good_event: 'status == RECONCILED within 300s',
    valid_event: 'all_payouts'
  },
  {
    id: 'sli_double_payout',
    name: 'Double Payout Rate',
    description: 'Jumlah double payout per 1 juta transaksi',
    metric: 'sum(rate(jp_double_payout_total[1h])) / sum(rate(jp_payout_total[1h])) * 1000000',
    unit: 'per_million',
    good_event: 'double_payout == 0',
    valid_event: 'all_payouts'
  },
  {
    id: 'sli_webhook_processing',
    name: 'Webhook Processing Time',
    description: 'Persentase webhook yang diproses < 60 detik',
    metric: 'histogram_quantile(0.95, rate(jp_webhook_processing_seconds_bucket[5m]))',
    unit: 's',
    good_event: 'duration < 60',
    valid_event: 'all_webhooks'
  },
  {
    id: 'sli_ledger_verification',
    name: 'Ledger Verification',
    description: 'Persentase verifikasi ledger yang berhasil (valid)',
    metric: 'sum(rate(jp_ledger_verify_total{status="valid"}[1h])) / sum(rate(jp_ledger_verify_total[1h]))',
    unit: '%',
    good_event: 'status == valid',
    valid_event: 'all_verifications'
  }
];
```

### 3.2 Definisi SLO (Service Level Objective)

**File:** `shared/slo-definitions.js`

```javascript
// @ts-check
import { SLI_DEFINITIONS } from './sli-definitions.js';

/**
 * Setiap SLO memiliki:
 * - id: identifier unik
 * - name: nama manusiawi
 * - sli_id: referensi ke SLI
 * - target: target (0-1)
 * - window: window (30d, 7d, 1d)
 * - error_budget: 1 - target
 * - burn_rate_threshold: threshold untuk alert
 */
export const SLO_DEFINITIONS = [
  {
    id: 'slo_decision_latency',
    name: 'Decision Latency < 500ms',
    sli_id: 'sli_decision_latency',
    target: 0.95,
    window: '30d',
    error_budget: 0.05,
    burn_rate_threshold: 14.4  // 2% budget in 1 hour
  },
  {
    id: 'slo_decision_availability',
    name: 'Decision Availability 99.9%',
    sli_id: 'sli_decision_availability',
    target: 0.999,
    window: '30d',
    error_budget: 0.001,
    burn_rate_threshold: 14.4
  },
  {
    id: 'slo_payout_success',
    name: 'Payout Success Rate 99.5%',
    sli_id: 'sli_payout_success',
    target: 0.995,
    window: '30d',
    error_budget: 0.005,
    burn_rate_threshold: 6
  },
  {
    id: 'slo_double_payout',
    name: 'Zero Double Payout',
    sli_id: 'sli_double_payout',
    target: 1.0,  // 0 double payout
    window: '30d',
    error_budget: 0,
    burn_rate_threshold: 1  // Any double payout = alert
  },
  {
    id: 'slo_webhook_processing',
    name: 'Webhook Processing < 60s',
    sli_id: 'sli_webhook_processing',
    target: 0.99,
    window: '7d',
    error_budget: 0.01,
    burn_rate_threshold: 14.4
  },
  {
    id: 'slo_ledger_verification',
    name: 'Ledger Verification 100%',
    sli_id: 'sli_ledger_verification',
    target: 1.0,
    window: '30d',
    error_budget: 0,
    burn_rate_threshold: 1
  }
];
```

### 3.3 Error Budget Policy

**File:** `docs/error-budget-policy.md`

```markdown
# Error Budget Policy

## Tujuan
Mendefinisikan apa yang terjadi ketika Error Budget habis.

## Aturan
1. **Jika Error Budget > 50%:** Normal operations.
2. **Jika Error Budget 10-50%:** Warning. Review SLO, identifikasi penyebab.
3. **Jika Error Budget < 10%:** Freeze fitur baru. Fokus pada perbaikan keandalan.
4. **Jika Error Budget habis (0%):** Freeze total. Hanya perbaikan bug dan keandalan.
5. **Jika double payout terjadi:** Error Budget dianggap habis, terlepas dari persentase.

## Proses
- Review mingguan: tim engineering + product.
- Keputusan freeze: oleh Engineering Lead.
- Unfreeze: setelah 2 minggu tanpa insiden kritis.
```

### 3.4 Endpoint SLO

#### 3.4.1 GET /api/v1/ops/slo

**Response 200:**
```json
{
  "slos": [
    {
      "id": "slo_decision_latency",
      "name": "Decision Latency < 500ms",
      "target": 0.95,
      "current": 0.97,
      "error_budget_remaining": 0.6,
      "burn_rate": 0.4,
      "status": "healthy",
      "window": "30d"
    },
    {
      "id": "slo_double_payout",
      "name": "Zero Double Payout",
      "target": 1.0,
      "current": 1.0,
      "error_budget_remaining": 1.0,
      "burn_rate": 0,
      "status": "healthy",
      "window": "30d"
    }
  ],
  "generated_at": "2026-11-07T10:00:00Z"
}
```

#### 3.4.2 GET /api/v1/ops/slo/{slo_id}

**Response 200:**
```json
{
  "id": "slo_decision_latency",
  "name": "Decision Latency < 500ms",
  "target": 0.95,
  "current": 0.97,
  "error_budget_remaining": 0.6,
  "burn_rate": 0.4,
  "status": "healthy",
  "window": "30d",
  "history": [
    { "timestamp": "2026-11-06T10:00:00Z", "value": 0.96 },
    { "timestamp": "2026-11-07T10:00:00Z", "value": 0.97 }
  ]
}
```

---

## 4. GRACEFUL SHUTDOWN

### 4.1 Prosedur

**File:** `server/src/shutdown.js`

```javascript
// @ts-check
import { logger } from './lib/logger.js';
import { pool } from './db/pool.js';
import { worker } from './jobs/worker.js';

const SHUTDOWN_TIMEOUT_MS = 30000;

export function setupGracefulShutdown(server) {
  let isShuttingDown = false;

  async function shutdown(signal) {
    if (isShuttingDown) {
      logger.warn({ signal }, 'Shutdown already in progress');
      return;
    }
    isShuttingDown = true;
    logger.info({ signal }, 'Graceful shutdown initiated');

    // 1. Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // 2. Stop worker from claiming new jobs
    worker.pause();

    // 3. Wait for in-flight requests (with timeout)
    const timeout = setTimeout(() => {
      logger.error('Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      // 4. Wait for worker to finish current jobs
      await worker.drain();
      logger.info('Worker drained');

      // 5. Close database pool
      await pool.end();
      logger.info('Database pool closed');

      clearTimeout(timeout);
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      clearTimeout(timeout);
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
```

### 4.2 Worker Pause/Drain

**File:** `server/src/jobs/worker.js` (modifikasi)

```javascript
// Tambahkan method pause() dan drain()
class Worker {
  constructor() {
    this.paused = false;
    this.activeJobs = new Set();
  }

  pause() {
    this.paused = true;
  }

  async drain() {
    while (this.activeJobs.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async processJob(job) {
    if (this.paused) return;
    this.activeJobs.add(job.id);
    try {
      await this.executeJob(job);
    } finally {
      this.activeJobs.delete(job.id);
    }
  }
}
```

### 4.3 Health Checks

**File:** `server/src/routes/health.js`

```javascript
// @ts-check
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { worker } from '../jobs/worker.js';
import { migrationStatus } from '../db/migrations.js';

const router = Router();

// Liveness: hanya cek process alive
router.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness: cek DB, migrasi, worker heartbeat
router.get('/readyz', async (req, res) => {
  const checks = {
    database: false,
    migrations: false,
    worker_heartbeat: false
  };

  try {
    const dbResult = await pool.query('SELECT 1');
    checks.database = dbResult.rowCount === 1;
  } catch (err) {
    // database false
  }

  try {
    checks.migrations = await migrationStatus();
  } catch (err) {
    // migrations false
  }

  try {
    checks.worker_heartbeat = worker.isAlive();
  } catch (err) {
    // worker false
  }

  const allReady = Object.values(checks).every(v => v === true);
  res.status(allReady ? 200 : 503).json({
    status: allReady ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString()
  });
});

// Startup: cek migrasi selesai
router.get('/startupz', async (req, res) => {
  try {
    const ready = await migrationStatus();
    res.status(ready ? 200 : 503).json({ status: ready ? 'started' : 'starting' });
  } catch (err) {
    res.status(503).json({ status: 'error' });
  }
});

export default router;
```

---

## 5. CIRCUIT BREAKER

### 5.1 Implementasi

**File:** `server/src/lib/circuit-breaker.js`

```javascript
// @ts-check
import { logger } from './logger.js';

export class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 30000;  // 30s
    this.resetTimeout = options.resetTimeout || 60000;  // 60s

    this.state = 'CLOSED';  // CLOSED, OPEN, HALF_OPEN
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

    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), this.timeout)
        )
      ]);
      this.onSuccess();
      return result;
    } catch (err) {
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

  getState() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      next_attempt: new Date(this.nextAttempt).toISOString()
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
  return Array.from(breakers.values()).map(b => b.getState());
}
```

### 5.2 Integrasi

**File:** `server/src/paypal/client.js` (modifikasi)
**File:** `server/src/ai/index.js` (modifikasi)

### 5.3 Endpoint Circuit Breaker

#### 5.3.1 GET /api/v1/ops/circuit-breakers

**Response 200:**
```json
{
  "breakers": [
    {
      "name": "paypal",
      "state": "CLOSED",
      "failures": 0,
      "next_attempt": "2026-11-07T10:00:00Z"
    },
    {
      "name": "ai",
      "state": "HALF_OPEN",
      "failures": 3,
      "next_attempt": "2026-11-07T10:01:00Z"
    }
  ]
}
```

---

## 6. OBSERVABILITY

### 6.1 Per-Tenant Dashboard

#### 6.1.1 GET /api/v1/ops/tenants/{org_id}/metrics

**Response 200:**
```json
{
  "org_id": "org_01HX...",
  "window": "1h",
  "metrics": {
    "requests_total": 1500,
    "requests_success": 1485,
    "requests_error": 15,
    "latency_p50_ms": 120,
    "latency_p95_ms": 450,
    "latency_p99_ms": 800,
    "decisions_total": 300,
    "decisions_approved": 250,
    "decisions_rejected": 30,
    "decisions_pending_approval": 20,
    "payouts_total": 200,
    "payouts_success": 198,
    "payouts_failed": 2,
    "rate_limit_utilization": 0.15
  },
  "generated_at": "2026-11-07T10:00:00Z"
}
```

### 6.2 Audit Log Queryable

#### 6.2.1 GET /api/v1/audit

**Query params:**
- `org_id` (required)
- `user_id` (optional)
- `action` (optional)
- `from` (optional, ISO-8601)
- `to` (optional, ISO-8601)
- `limit` (default 100, max 1000)
- `cursor` (optional)

**Response 200:**
```json
{
  "events": [
    {
      "event_id": "evt_01HX...",
      "org_id": "org_01HX...",
      "user_id": "usr_01HX...",
      "action": "mandate.activated",
      "resource_type": "mandate",
      "resource_id": "mnd_01HX...",
      "metadata": { "version": 3 },
      "created_at": "2026-11-07T09:30:00Z"
    }
  ],
  "next_cursor": "cursor_xyz...",
  "has_more": false
}
```

---

## 7. RUNBOOK

### 7.1 Struktur Runbook
Daftar 10 runbook operasional di `docs/runbook/`.

### 7.2 Alert Definitions
File: `shared/alert-definitions.js`.

---

## 8. DEPLOYMENT READINESS

- `docs/runbook/rollback.md`
- `docs/runbook/canary.md`
- `docs/exceptions.md`

---

## 9. SECRET ROTATION

- `server/src/services/secret_rotation.js`
- `server/migrations/049_secret_rotation.sql` (Catatan penomoran migrasi: lanjut dari 048).
- `POST /api/v1/agents/:agent_id/keys/rotate`
- `POST /api/v1/org/ledger-keys/rotate`

---

## 10. LOAD TESTING & CAPACITY MODEL

- `scripts/load-test.js`
- `docs/load-test-results.md`
- `docs/capacity-model.md`

---

## 11. TEST SUITE

- Unit tests: SLI, SLO, Circuit breaker, Shutdown, Secret rotation.
- Integration tests: Health endpoints, Ops endpoints, Audit query, Rotation API.
- Coverage 100% untuk modul baru: `circuit-breaker.js`, `slo_service.js`, `secret_rotation.js`, `shutdown.js`.
