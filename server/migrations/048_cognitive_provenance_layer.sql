-- 048_cognitive_provenance_layer.sql
-- PRD 1.7 Cognitive Provenance Layer (CPL) Schema

BEGIN;

-- 5.1.1 Cognitive Snapshots
CREATE TABLE IF NOT EXISTS cognitive_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  request_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES organizations(id),
  model JSONB NOT NULL,
  inputs JSONB NOT NULL,
  outputs JSONB NOT NULL,
  environment JSONB,
  snapshot_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cognitive_snapshots DROP CONSTRAINT IF EXISTS uq_cognitive_snapshots_request;
ALTER TABLE cognitive_snapshots ADD CONSTRAINT uq_cognitive_snapshots_request UNIQUE(request_id);

CREATE INDEX IF NOT EXISTS idx_cognitive_snapshots_request ON cognitive_snapshots(request_id);
CREATE INDEX IF NOT EXISTS idx_cognitive_snapshots_org ON cognitive_snapshots(org_id);
CREATE INDEX IF NOT EXISTS idx_cognitive_snapshots_hash ON cognitive_snapshots(snapshot_hash);

-- 5.1.2 Replay Results
CREATE TABLE IF NOT EXISTS replay_results (
  replay_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  snapshot_id UUID NOT NULL REFERENCES cognitive_snapshots(snapshot_id),
  org_id UUID NOT NULL REFERENCES organizations(id),
  replay_model JSONB NOT NULL,
  replay_outputs JSONB NOT NULL,
  reproducibility_score INT NOT NULL CHECK (reproducibility_score BETWEEN 0 AND 100),
  components JSONB NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('AUTO_APPROVE','REQUIRE_APPROVAL','REJECTED')),
  replay_hash TEXT NOT NULL,
  replayed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_replay_results_snapshot ON replay_results(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_replay_results_org_score ON replay_results(org_id, reproducibility_score);

COMMIT;
