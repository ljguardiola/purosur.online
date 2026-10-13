PRAGMA defer_foreign_keys = ON;

CREATE TABLE deferred_sales_held AS
  SELECT sale_id, reason, routed_at, satisfied_by_fiscal_document_id, satisfied_at
  FROM deferred_sales;

DROP TABLE deferred_sales;

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
      'unclear_outcome'
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

INSERT INTO deferred_sales (
  id, sale_id, occurred_at, total, reason, short_code, routed_at,
  satisfied_by_fiscal_document_id, satisfied_at
)
  SELECT
    lower(hex(randomblob(16))),
    held.sale_id,
    sales.occurred_at,
    COALESCE(subtotals.amount, 0) - CASE sales.sale_discount_kind
      WHEN 'AMOUNT' THEN sales.sale_discount_value
      WHEN 'PERCENT' THEN (COALESCE(subtotals.amount, 0) * sales.sale_discount_value + 50) / 100
      ELSE 0
    END,
    held.reason,
    substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + (random() & 31), 1)
      || substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + (random() & 31), 1)
      || substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + (random() & 31), 1)
      || substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + (random() & 31), 1)
      || substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + (random() & 31), 1)
      || substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + (random() & 31), 1)
      || substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + (random() & 31), 1)
      || substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + (random() & 31), 1),
    held.routed_at,
    held.satisfied_by_fiscal_document_id,
    held.satisfied_at
  FROM deferred_sales_held AS held
  JOIN sales ON sales.id = held.sale_id
  LEFT JOIN (
    SELECT sale_id, SUM(line_total) AS amount FROM sale_lines GROUP BY sale_id
  ) AS subtotals ON subtotals.sale_id = held.sale_id;

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
