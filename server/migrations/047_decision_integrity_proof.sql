-- 047_decision_integrity_proof.sql
-- PRD 1.6 Decision Integrity Proof (DIP) Schema

BEGIN;

-- 1. Intent Anchors extension on intent_mandates
ALTER TABLE intent_mandates ADD COLUMN IF NOT EXISTS structured_intent_v2 JSONB;
ALTER TABLE intent_mandates ADD COLUMN IF NOT EXISTS intent_hash_v2 TEXT;

-- 2. Reasoning Traces
CREATE TABLE IF NOT EXISTS reasoning_traces (
  trace_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  request_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES organizations(id),
  reasons JSONB NOT NULL,
  trace_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE reasoning_traces DROP CONSTRAINT IF EXISTS uq_reasoning_traces_request;
ALTER TABLE reasoning_traces ADD CONSTRAINT uq_reasoning_traces_request UNIQUE(request_id);

CREATE INDEX IF NOT EXISTS idx_reasoning_traces_request ON reasoning_traces(request_id);
CREATE INDEX IF NOT EXISTS idx_reasoning_traces_org ON reasoning_traces(org_id);

-- 3. Decision Integrity Scores
CREATE TABLE IF NOT EXISTS decision_integrity_scores (
  dis_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  request_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES organizations(id),
  score INT NOT NULL CHECK (score BETWEEN 0 AND 100),
  components JSONB NOT NULL,
  hard_rule_triggered TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('AUTO_APPROVE','REQUIRE_APPROVAL','REJECTED')),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE decision_integrity_scores DROP CONSTRAINT IF EXISTS uq_decision_integrity_scores_request;
ALTER TABLE decision_integrity_scores ADD CONSTRAINT uq_decision_integrity_scores_request UNIQUE(request_id);

CREATE INDEX IF NOT EXISTS idx_dis_request ON decision_integrity_scores(request_id);
CREATE INDEX IF NOT EXISTS idx_dis_org_score ON decision_integrity_scores(org_id, score);

COMMIT;
