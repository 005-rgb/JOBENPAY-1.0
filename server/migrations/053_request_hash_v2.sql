-- 053_request_hash_v2.sql
-- PRD 2.0 Unified Architecture §2.1: request_hash v2 Schema
-- Tracks hash version for backward compatibility (v1 vs v2)

ALTER TABLE transaction_intents ADD COLUMN IF NOT EXISTS request_hash_version TEXT DEFAULT 'v1' CHECK (request_hash_version IN ('v1', 'v2'));
CREATE INDEX IF NOT EXISTS idx_intents_hash_version ON transaction_intents(request_hash_version);
