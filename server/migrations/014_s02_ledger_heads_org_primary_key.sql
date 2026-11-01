ALTER TABLE ledger_heads
  DROP CONSTRAINT IF EXISTS ledger_heads_pkey;

ALTER TABLE ledger_heads
  DROP CONSTRAINT IF EXISTS ledger_heads_org_id_key;

ALTER TABLE ledger_heads
  ADD CONSTRAINT ledger_heads_pkey PRIMARY KEY (org_id);
