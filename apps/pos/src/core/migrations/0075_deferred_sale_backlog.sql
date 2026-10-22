PRAGMA defer_foreign_keys = ON;

DROP TRIGGER deferred_sales_inserted_satisfied_by_own_authorization;
DROP TRIGGER deferred_sales_updated_satisfied_by_own_authorization;

CREATE TABLE fiscal_documents_held AS
  SELECT id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
         authorization_code, authorization_code_due_on, reserved_at, resolved_at
  FROM fiscal_documents;

CREATE TABLE deferred_sales_held AS
  SELECT id, sale_id, occurred_at, total, reason, short_code, routed_at,
         satisfied_by_fiscal_document_id, satisfied_at, cancelled_at
  FROM deferred_sales;

DROP TABLE deferred_sales;
DROP TABLE fiscal_documents;

CREATE TABLE fiscal_documents (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales (id),
  point_of_sale INTEGER NOT NULL CHECK (point_of_sale BETWEEN 1 AND 99999),
  document_type TEXT NOT NULL CHECK (document_type IN ('factura_c')),
  number INTEGER NOT NULL CHECK (number > 0),
  issued_on TEXT NOT NULL,
  document TEXT NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN ('REQUESTING', 'AUTHORIZED', 'REJECTED', 'UNKNOWN', 'RELEASED', 'CONFLICTING')
  ),
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

INSERT INTO fiscal_documents (
  id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
  authorization_code, authorization_code_due_on, reserved_at, resolved_at
)
SELECT id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
       authorization_code, authorization_code_due_on, reserved_at, resolved_at
FROM fiscal_documents_held;

DROP TABLE fiscal_documents_held;

CREATE TABLE deferred_sales (
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
      'clock_behind',
      'deferred_backlog'
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

INSERT INTO deferred_sales (
  id, sale_id, occurred_at, total, reason, short_code, routed_at,
  satisfied_by_fiscal_document_id, satisfied_at, cancelled_at
)
SELECT id, sale_id, occurred_at, total, reason, short_code, routed_at,
       satisfied_by_fiscal_document_id, satisfied_at, cancelled_at
FROM deferred_sales_held;

DROP TABLE deferred_sales_held;

CREATE UNIQUE INDEX fiscal_documents_one_waiting
  ON fiscal_documents (point_of_sale, document_type)
  WHERE state IN ('REQUESTING', 'UNKNOWN');

CREATE UNIQUE INDEX fiscal_documents_number_in_use
  ON fiscal_documents (point_of_sale, document_type, number)
  WHERE state NOT IN ('REJECTED', 'RELEASED');

CREATE UNIQUE INDEX fiscal_documents_one_open_per_sale
  ON fiscal_documents (sale_id)
  WHERE state IN ('REQUESTING', 'UNKNOWN', 'AUTHORIZED');

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

CREATE TABLE offline_fiscal_documents_rebuilt (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL UNIQUE REFERENCES sales (id),
  point_of_sale INTEGER NOT NULL CHECK (point_of_sale BETWEEN 1 AND 99999),
  document_type TEXT NOT NULL CHECK (document_type IN ('factura_c')),
  number INTEGER NOT NULL CHECK (number > 0),
  issued_on TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  generation_stamp TEXT NOT NULL CHECK (generation_stamp GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  offline_authorization_code TEXT NOT NULL,
  fortnight_start TEXT NOT NULL,
  fortnight_end TEXT NOT NULL,
  document TEXT NOT NULL,
  buyer_document_type INTEGER NOT NULL,
  buyer_document_number INTEGER NOT NULL,
  cause TEXT NOT NULL CHECK (cause IN ('no_connectivity', 'unclear_outcome', 'numbering_conflict', 'clock_correction_lapse', 'deferred_backlog')),
  UNIQUE (point_of_sale, document_type, number)
);

INSERT INTO offline_fiscal_documents_rebuilt (
  id, sale_id, point_of_sale, document_type, number, issued_on, generated_at, generation_stamp,
  offline_authorization_code, fortnight_start, fortnight_end, document,
  buyer_document_type, buyer_document_number, cause
)
SELECT id, sale_id, point_of_sale, document_type, number, issued_on, generated_at, generation_stamp,
       offline_authorization_code, fortnight_start, fortnight_end, document,
       buyer_document_type, buyer_document_number, cause
FROM offline_fiscal_documents;

DROP TABLE offline_fiscal_documents;

ALTER TABLE offline_fiscal_documents_rebuilt RENAME TO offline_fiscal_documents;
