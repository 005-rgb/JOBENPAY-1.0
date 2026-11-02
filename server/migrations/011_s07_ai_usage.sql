CREATE TABLE ai_usage (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  task text NOT NULL,
  reserved_input_tokens integer NOT NULL DEFAULT 0,
  reserved_output_tokens integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(20, 12) NOT NULL DEFAULT 0,
  reserved_cost_usd numeric(20, 12) NOT NULL DEFAULT 0
);

CREATE INDEX idx_ai_usage_org_created ON ai_usage (org_id, created_at);

CREATE UNIQUE INDEX idx_document_extractions_org_document_unique
  ON document_extractions (org_id, document_id);

ALTER TABLE document_extractions
  ADD CONSTRAINT document_extractions_confidence_range
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
