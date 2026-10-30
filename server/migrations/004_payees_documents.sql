CREATE TABLE payees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  display_name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('EMAIL', 'PAYPAL_ID', 'PHONE')),
  identifier_enc text,
  identifier_hmac text,
  identifier_masked text,
  trust text NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (trust IN ('PENDING_REVIEW', 'TRUSTED', 'BLOCKED')),
  UNIQUE (org_id, identifier_hmac)
);

CREATE TABLE payee_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  payee_id uuid NOT NULL,
  field text NOT NULL,
  old_hmac text,
  new_hmac text,
  changed_by uuid
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  uploader_kind text NOT NULL CHECK (uploader_kind IN ('USER', 'AGENT')),
  uploader_id uuid NOT NULL,
  filename text NOT NULL,
  mime text,
  size bigint,
  sha256 text,
  storage_key text,
  status text,
  injection_flags jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE document_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  document_id uuid NOT NULL,
  payee_name text,
  invoice_number text,
  amount_minor bigint,
  currency char(3),
  due_date date,
  items jsonb,
  notes text,
  confidence numeric,
  prompt_version text
);

CREATE INDEX idx_payees_org ON payees (org_id, id);
CREATE INDEX idx_payee_revisions_org ON payee_revisions (org_id, payee_id);
CREATE INDEX idx_documents_org ON documents (org_id, id);
CREATE INDEX idx_document_extractions_org ON document_extractions (org_id, document_id);
