ALTER TABLE register_point_of_sale
  ADD COLUMN numbering_frozen INTEGER NOT NULL DEFAULT 0 CHECK (numbering_frozen IN (0, 1));

INSERT INTO pulled_table_redeliveries (table_name) VALUES ('register_point_of_sale')
  ON CONFLICT (table_name) DO UPDATE SET cursor = 0;

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
      'numbering_frozen'
    )
  ),
  short_code TEXT NOT NULL UNIQUE CHECK (
    short_code GLOB '[2-9A-HJ-NP-Z][2-9A-HJ-NP-Z][2-9A-HJ-NP-Z][2-9A-HJ-NP-Z][2-9A-HJ-NP-Z][2-9A-HJ-NP-Z][2-9A-HJ-NP-Z][2-9A-HJ-NP-Z]'
  ),
  routed_at TEXT NOT NULL,
  satisfied_by_fiscal_document_id TEXT REFERENCES fiscal_documents (id),
  satisfied_at TEXT,
  CHECK ((satisfied_by_fiscal_document_id IS NULL) = (satisfied_at IS NULL))
);

INSERT INTO deferred_sales_rebuilt (
  id, sale_id, occurred_at, total, reason, short_code, routed_at,
  satisfied_by_fiscal_document_id, satisfied_at
)
SELECT id, sale_id, occurred_at, total, reason, short_code, routed_at,
       satisfied_by_fiscal_document_id, satisfied_at
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
