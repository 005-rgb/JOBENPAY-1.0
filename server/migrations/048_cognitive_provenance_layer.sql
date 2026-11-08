-- 048_cognitive_provenance_layer.sql
-- PRD 1.7 Cognitive Provenance Layer (CPL) Schema

BEGIN;

-- 5.1.1 Cognitive Snapshots
CREATE TABLE IF NOT EXISTS cognitive_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_cognitive_snapshots_request'
      AND conrelid = 'cognitive_snapshots'::regclass
  ) THEN
    ALTER TABLE cognitive_snapshots ADD CONSTRAINT uq_cognitive_snapshots_request UNIQUE(request_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cognitive_snapshots_request ON cognitive_snapshots(request_id);
CREATE INDEX IF NOT EXISTS idx_cognitive_snapshots_org ON cognitive_snapshots(org_id);
CREATE INDEX IF NOT EXISTS idx_cognitive_snapshots_hash ON cognitive_snapshots(snapshot_hash);

-- 5.1.2 Replay Results
CREATE TABLE IF NOT EXISTS replay_results (
  replay_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
