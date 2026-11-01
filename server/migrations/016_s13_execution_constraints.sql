CREATE UNIQUE INDEX IF NOT EXISTS uq_executions_org_request_kind
  ON executions (org_id, request_id, kind);
