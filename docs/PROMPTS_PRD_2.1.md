# PRD 2.1 — JOBENPAY Unified Architecture Patch
## Environment Isolation Fix, Test Optimization & Routing Repair

**Versi:** 2.1 (Patch untuk PRD 2.0)  
**Status:** Implementation-ready, Zero-Hallucination  
**Target:** Memperbaiki kode PRD 2.0 yang sudah ter-build agar selaras dengan PRD 3.0 (Multi-Environment) dan mencegah AI Builder *timeout/hang*.

---

## 0. ATURAN EMAS (NON-NEGOTIABLE)

1. **Jangan Hapus Data.** Migrasi wajib menggunakan `ADD COLUMN IF NOT EXISTS` dengan default `'SANDBOX'`.
2. **Isolasi Tabel Unifikasi.** Tabel `entities`, `escrow_accounts`, `outcome_contracts`, dan `cognitive_snapshots` **wajib** memiliki kolom `environment`.
3. **Longgarkan Coverage (PENTING).** Hapus aturan `--lines 100` secara global untuk mencegah AI *hang*. Gunakan target 90% (kecuali modul uang).
4. **Routing Priority.** Rute API (`/api/v1/*`) wajib didaftarkan sebelum *catch-all fallback* React (`*`) di `server.js`.

---

## 1. SKEMA DATA (MIGRASI PATCH)

**File:** `server/migrations/054_unified_environment_patch.sql` (sequence forward dari 053)

```sql
BEGIN;

-- 1.0 Create environment_type enum if not exists
DO $$ BEGIN
  CREATE TYPE environment_type AS ENUM ('SANDBOX', 'PRODUCTION', 'SIMULATED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 1.1 Patch Tabel Entities
ALTER TABLE entities ADD COLUMN IF NOT EXISTS environment environment_type NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_org_id_entity_type_key;
ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_org_id_env_type_key;
ALTER TABLE entities ADD CONSTRAINT entities_org_id_env_type_key UNIQUE(org_id, environment, entity_type);

-- 1.2 Patch Tabel Escrow Accounts
ALTER TABLE escrow_accounts ADD COLUMN IF NOT EXISTS environment environment_type NOT NULL DEFAULT 'SANDBOX';

-- 1.3 Patch Tabel Outcome Contracts
ALTER TABLE outcome_contracts ADD COLUMN IF NOT EXISTS environment environment_type NOT NULL DEFAULT 'SANDBOX';

-- 1.4 Patch Tabel Cognitive Snapshots (Dari PRD 1.7)
DO $$ BEGIN
  ALTER TABLE cognitive_snapshots ADD COLUMN IF NOT EXISTS environment environment_type NOT NULL DEFAULT 'SANDBOX';
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- 1.5 Aktifkan RLS (Row Level Security) pada tabel yang baru di-patch
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE outcome_contracts ENABLE ROW LEVEL SECURITY;

-- 1.6 Buat Policy RLS
DROP POLICY IF EXISTS entities_env_isolation ON entities;
CREATE POLICY entities_env_isolation ON entities FOR ALL USING (
  environment = COALESCE(NULLIF(current_setting('app.current_environment', true), ''), 'SANDBOX')::environment_type
);

DROP POLICY IF EXISTS escrow_env_isolation ON escrow_accounts;
CREATE POLICY escrow_env_isolation ON escrow_accounts FOR ALL USING (
  environment = COALESCE(NULLIF(current_setting('app.current_environment', true), ''), 'SANDBOX')::environment_type
);

DROP POLICY IF EXISTS contracts_env_isolation ON outcome_contracts;
CREATE POLICY contracts_env_isolation ON outcome_contracts FOR ALL USING (
  environment = COALESCE(NULLIF(current_setting('app.current_environment', true), ''), 'SANDBOX')::environment_type
);

COMMIT;
```

---

## 2. SERVICE LAYER PATCH

Setiap service yang menangani tabel di atas **wajib** menerima parameter `environment` dan memfilternya di query.

---

## 3. PERBAIKAN COVERAGE (MENGATASI AI HANG)

Target 90% untuk `test:coverage`, target 100% khusus `test:coverage:money`.

---

## 4. PERBAIKAN ROUTING (JPL & REACT FALLBACK)

Urutan rute:
1. Middleware Global
2. `environmentMiddleware`
3. Semua API Routes (`/api/v1/*`)
4. Error Handler JSON
5. SPA Fallback
