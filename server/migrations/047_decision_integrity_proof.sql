-- 047_decision_integrity_proof.sql
-- PRD 1.6 Decision Integrity Proof (DIP) Schema

BEGIN;

-- 1. Intent Anchors extension on intent_mandates
ALTER TABLE intent_mandates ADD COLUMN IF NOT EXISTS structured_intent_v2 JSONB;
ALTER TABLE intent_mandates ADD COLUMN IF NOT EXISTS intent_hash_v2 TEXT;

-- 2. Reasoning Traces
CREATE TABLE IF NOT EXISTS reasoning_traces (
  trace_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES organizations(id),
  reasons JSONB NOT NULL,
  trace_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_reasoning_traces_request'
      AND conrelid = 'reasoning_traces'::regclass
  ) THEN
    ALTER TABLE reasoning_traces ADD CONSTRAINT uq_reasoning_traces_request UNIQUE(request_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reasoning_traces_request ON reasoning_traces(request_id);
CREATE INDEX IF NOT EXISTS idx_reasoning_traces_org ON reasoning_traces(org_id);

-- 3. Decision Integrity Scores
CREATE TABLE IF NOT EXISTS decision_integrity_scores (
  dis_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES organizations(id),
  score INT NOT NULL CHECK (score BETWEEN 0 AND 100),
  components JSONB NOT NULL,
  hard_rule_triggered TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('AUTO_APPROVE','REQUIRE_APPROVAL','REJECTED')),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_decision_integrity_scores_request'
      AND conrelid = 'decision_integrity_scores'::regclass
  ) THEN
    ALTER TABLE decision_integrity_scores ADD CONSTRAINT uq_decision_integrity_scores_request UNIQUE(request_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dis_request ON decision_integrity_scores(request_id);
CREATE INDEX IF NOT EXISTS idx_dis_org_score ON decision_integrity_scores(org_id, score);

COMMIT;
