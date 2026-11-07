-- Migration 028: Invoice category schema and indices (K-INVOICE, T-05)

CREATE INDEX IF NOT EXISTS idx_intents_invoice_org_status
  ON transaction_intents (org_id, status)
  WHERE category = 'INVOICE';

CREATE INDEX IF NOT EXISTS idx_intents_invoice_counterparty
  ON transaction_intents (org_id, counterparty_id)
  WHERE category = 'INVOICE';

CREATE INDEX IF NOT EXISTS idx_invoice_records_org_num
  ON invoice_records (org_id, invoice_number);

