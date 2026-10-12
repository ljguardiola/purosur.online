PRAGMA defer_foreign_keys = ON;

CREATE TABLE fiscal_documents_held AS
  SELECT id, sale_id, point_of_sale, document_type, number, issued_on, document, state,
         authorization_code, authorization_code_due_on, reserved_at, resolved_at
  FROM fiscal_documents;

CREATE TABLE deferred_sales_held AS
  SELECT sale_id, reason, routed_at FROM deferred_sales;

DROP TABLE deferred_sales;
DROP TABLE fiscal_documents;

CREATE TABLE fiscal_documents (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL UNIQUE REFERENCES sales (id),
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

CREATE UNIQUE INDEX fiscal_documents_one_waiting
  ON fiscal_documents (point_of_sale, document_type)
  WHERE state IN ('REQUESTING', 'UNKNOWN');

CREATE UNIQUE INDEX fiscal_documents_number_in_use
  ON fiscal_documents (point_of_sale, document_type, number)
  WHERE state NOT IN ('REJECTED', 'RELEASED');

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
  routed_at TEXT NOT NULL,
  satisfied_by_fiscal_document_id TEXT REFERENCES fiscal_documents (id),
  satisfied_at TEXT,
  CHECK ((satisfied_by_fiscal_document_id IS NULL) = (satisfied_at IS NULL))
);

INSERT INTO deferred_sales (sale_id, reason, routed_at)
  SELECT sale_id, reason, routed_at FROM deferred_sales_held;

DROP TABLE deferred_sales_held;

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
