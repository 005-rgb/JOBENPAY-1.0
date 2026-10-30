UPDATE jobs SET status = 'PENDING' WHERE status IS NULL;

ALTER TABLE jobs
  ALTER COLUMN status SET DEFAULT 'PENDING',
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_status_check CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'DEAD'));

CREATE INDEX idx_jobs_claim ON jobs (run_at, created_at)
  WHERE status IN ('PENDING', 'RUNNING');
