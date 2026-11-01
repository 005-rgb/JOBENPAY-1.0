ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS reserved_period_id uuid,
  ADD COLUMN IF NOT EXISTS reserved_amount_minor bigint,
  ADD COLUMN IF NOT EXISTS reserved_released boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_payment_requests_org_status_created
  ON payment_requests (org_id, status, created_at);
