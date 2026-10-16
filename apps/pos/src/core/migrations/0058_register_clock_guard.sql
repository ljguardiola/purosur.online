ALTER TABLE register_point_of_sale
  ADD COLUMN tax_authority_last_authorized_issued_on TEXT;

INSERT INTO pulled_table_redeliveries (table_name) VALUES ('register_point_of_sale')
  ON CONFLICT (table_name) DO UPDATE SET cursor = 0;

CREATE TABLE register_clock_marks (
  point_of_sale INTEGER NOT NULL CHECK (point_of_sale > 0),
  document_type TEXT NOT NULL CHECK (document_type IN ('factura_c')),
  reading TEXT NOT NULL,
  PRIMARY KEY (point_of_sale, document_type)
);

CREATE TABLE clock_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL,
  register_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  point_of_sale INTEGER NOT NULL CHECK (point_of_sale > 0),
  document_type TEXT NOT NULL CHECK (document_type IN ('factura_c')),
  previous_reading TEXT NOT NULL,
  corrected_reading TEXT NOT NULL,
  CHECK (corrected_reading < previous_reading)
);

CREATE INDEX clock_corrections_by_period ON clock_corrections (period);

DROP TRIGGER deferred_sales_inserted_satisfied_by_own_authorization;
DROP TRIGGER deferred_sales_updated_satisfied_by_own_authorization;

CREATE TABLE deferred_sales_rebuilt (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL UNIQUE REFERENCES sales (id),
  occurred_at TEXT NOT NULL,
  total INTEGER NOT NULL CHECK (total >= 0),
  reason TEXT NOT NULL CHECK (
    reason IN (
      'pre_emission_gate_failed',
      'fiscally_offline',
      'point_of_sale_missing',
      'document_waiting',
      'tax_authority_count_unknown',
      'rejected',
      'unclear_outcome',
      'numbering_frozen',
      'clock_behind'
    )
  ),
  short_code TEXT NOT NULL UNIQUE CHECK (
    short_code GLOB '[2-9A-HJ-NP-Z][2-9A-HJ-NP-Z][2-9A-HJ-NP-Z][2-9A-HJ-NP-Z][2-9A-HJ-NP-Z][2-9A-HJ-NP-Z][2-9A-HJ-NP-Z][2-9A-HJ-NP-Z]'
  ),
  routed_at TEXT NOT NULL,
  satisfied_by_fiscal_document_id TEXT REFERENCES fiscal_documents (id),
  satisfied_at TEXT,
  cancelled_at TEXT CHECK (cancelled_at IS NULL OR satisfied_at IS NULL),
  CHECK ((satisfied_by_fiscal_document_id IS NULL) = (satisfied_at IS NULL))
);

INSERT INTO deferred_sales_rebuilt (
  id, sale_id, occurred_at, total, reason, short_code, routed_at,
  satisfied_by_fiscal_document_id, satisfied_at, cancelled_at
)
SELECT id, sale_id, occurred_at, total, reason, short_code, routed_at,
       satisfied_by_fiscal_document_id, satisfied_at, cancelled_at
FROM deferred_sales;

DROP TABLE deferred_sales;

ALTER TABLE deferred_sales_rebuilt RENAME TO deferred_sales;

CREATE TRIGGER deferred_sales_inserted_satisfied_by_own_authorization
BEFORE INSERT ON deferred_sales
WHEN NEW.satisfied_by_fiscal_document_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM fiscal_documents
    WHERE id = NEW.satisfied_by_fiscal_document_id
      AND sale_id = NEW.sale_id
      AND state = 'AUTHORIZED'
  )
BEGIN
  SELECT RAISE(ABORT, 'a deferred sale is satisfied only by an authorized fiscal document of its own sale');
END;

CREATE TRIGGER deferred_sales_updated_satisfied_by_own_authorization
BEFORE UPDATE OF sale_id, satisfied_by_fiscal_document_id ON deferred_sales
WHEN NEW.satisfied_by_fiscal_document_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM fiscal_documents
    WHERE id = NEW.satisfied_by_fiscal_document_id
      AND sale_id = NEW.sale_id
      AND state = 'AUTHORIZED'
  )
BEGIN
  SELECT RAISE(ABORT, 'a deferred sale is satisfied only by an authorized fiscal document of its own sale');
END;
