CREATE OR REPLACE FUNCTION reject_mandate_version_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD.activated_at IS NOT NULL THEN
    RAISE EXCEPTION 'activated mandate versions are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
