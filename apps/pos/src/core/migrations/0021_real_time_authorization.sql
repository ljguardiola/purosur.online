CREATE TABLE register_health_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checked_at TEXT NOT NULL,
  round_trip_ms INTEGER NOT NULL CHECK (round_trip_ms >= 0),
  token_valid INTEGER NOT NULL CHECK (token_valid IN (0, 1)),
  arca_reachable INTEGER NOT NULL CHECK (arca_reachable IN (0, 1))
);

CREATE TABLE fiscal_documents (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL UNIQUE REFERENCES sales (id),
  point_of_sale INTEGER NOT NULL CHECK (point_of_sale BETWEEN 1 AND 99999),
  document_type TEXT NOT NULL CHECK (document_type IN ('FACTURA_C')),
  number INTEGER NOT NULL CHECK (number > 0),
  issued_on TEXT NOT NULL,
  document TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('REQUESTING', 'AUTHORIZED', 'REJECTED', 'UNKNOWN')),
  authorization_code TEXT,
  authorization_code_due_on TEXT,
  reserved_at TEXT NOT NULL,
  resolved_at TEXT,
  CHECK (
    (state = 'AUTHORIZED' AND authorization_code IS NOT NULL AND authorization_code_due_on IS NOT NULL)
    OR (state <> 'AUTHORIZED' AND authorization_code IS NULL AND authorization_code_due_on IS NULL)
  ),
  CHECK ((state = 'REQUESTING') = (resolved_at IS NULL))
);

CREATE UNIQUE INDEX fiscal_documents_one_waiting
  ON fiscal_documents (point_of_sale, document_type)
  WHERE state IN ('REQUESTING', 'UNKNOWN');

CREATE UNIQUE INDEX fiscal_documents_number_in_use
  ON fiscal_documents (point_of_sale, document_type, number)
  WHERE state <> 'REJECTED';

CREATE TABLE deferred_sales (
  sale_id TEXT PRIMARY KEY REFERENCES sales (id),
  reason TEXT NOT NULL CHECK (
    reason IN (
      'pre_emission_gate_failed',
      'fiscally_offline',
      'point_of_sale_missing',
      'document_waiting',
      'tax_authority_count_unknown',
      'rejected',
      'unclear_outcome'
    )
  ),
  routed_at TEXT NOT NULL
);

ALTER TABLE register_point_of_sale
  ADD COLUMN tax_authority_last_authorized_number INTEGER
  CHECK (tax_authority_last_authorized_number IS NULL OR tax_authority_last_authorized_number >= 0);
