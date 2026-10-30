CREATE OR REPLACE FUNCTION reject_ledger_entry_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_immutable
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION reject_ledger_entry_mutation();

CREATE OR REPLACE FUNCTION reject_mandate_version_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'mandate_versions is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mandate_versions_immutable
BEFORE UPDATE OR DELETE ON mandate_versions
FOR EACH ROW EXECUTE FUNCTION reject_mandate_version_mutation();
