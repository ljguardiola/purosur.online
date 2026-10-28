PRAGMA defer_foreign_keys = ON;

CREATE TABLE branch_sales_for_return (
  sale_id TEXT PRIMARY KEY,
  facts TEXT NOT NULL CHECK (json_valid(facts))
);

CREATE TABLE sale_credit_notes_held AS SELECT * FROM sale_credit_notes;

CREATE TABLE credit_note_prints_held AS SELECT * FROM credit_note_prints;

CREATE TABLE credit_note_receipts_held AS SELECT * FROM credit_note_receipts;

CREATE TABLE replenished_credit_note_requests_held AS SELECT * FROM replenished_credit_note_requests;

DROP TABLE replenished_credit_note_requests;

DROP TABLE credit_note_prints;

DROP TABLE credit_note_receipts;

DROP INDEX sale_credit_notes_one_per_voided_sale;

DROP INDEX sale_credit_notes_by_sale;

DROP INDEX sale_credit_notes_in_progress;

DROP TABLE sale_credit_notes;

CREATE TABLE returns_rebuilt (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  register_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES cash_sessions (id),
  actor_id TEXT NOT NULL,
  authorized_by TEXT,
  ticket_source TEXT NOT NULL CHECK (ticket_source IN ('QR', 'TYPED')),
  occurred_at TEXT NOT NULL
);

INSERT INTO returns_rebuilt (id, sale_id, register_id, device_id, session_id, actor_id, authorized_by, ticket_source, occurred_at)
SELECT id, sale_id, register_id, device_id, session_id, actor_id, authorized_by, ticket_source, occurred_at FROM returns;

CREATE TABLE return_lines_rebuilt (
  return_id TEXT NOT NULL REFERENCES returns_rebuilt (id),
  sale_line_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reason TEXT NOT NULL CHECK (reason IN ('change_of_mind', 'defective')),
  disposition TEXT NOT NULL CHECK (disposition IN ('restock', 'discard')),
  refunded_amount INTEGER NOT NULL CHECK (refunded_amount >= 0),
  PRIMARY KEY (return_id, sale_line_id)
);

INSERT INTO return_lines_rebuilt (return_id, sale_line_id, quantity, reason, disposition, refunded_amount)
SELECT return_id, sale_line_id, quantity, reason, disposition, refunded_amount FROM return_lines;

CREATE TABLE payment_refunds_rebuilt (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  return_id TEXT REFERENCES returns_rebuilt (id),
  method TEXT NOT NULL CHECK (method IN ('CASH', 'TRANSFER', 'STANDALONE_TERMINAL', 'QR', 'POINT')),
  provider TEXT NOT NULL CHECK (provider IN ('NONE', 'EXTERNAL_TERMINAL', 'MERCADOPAGO_QR', 'MERCADOPAGO_POINT')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  state TEXT NOT NULL CHECK (state IN ('APPROVED', 'PENDING')),
  occurred_at TEXT NOT NULL,
  CHECK (
    (method = 'STANDALONE_TERMINAL' AND provider = 'EXTERNAL_TERMINAL' AND state = 'PENDING')
    OR (method = 'QR' AND provider = 'MERCADOPAGO_QR' AND state = 'PENDING')
    OR (method = 'POINT' AND provider = 'MERCADOPAGO_POINT' AND state = 'PENDING')
    OR (method NOT IN ('STANDALONE_TERMINAL', 'QR', 'POINT') AND provider = 'NONE')
  )
);

INSERT INTO payment_refunds_rebuilt (id, payment_id, return_id, method, provider, amount, state, occurred_at)
SELECT id, payment_id, return_id, method, provider, amount, state, occurred_at FROM payment_refunds;

CREATE TABLE stock_movements_rebuilt (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (
    kind IN ('sale', 'sale_void', 'return', 'loss', 'adjustment', 'count', 'receipt', 'opening_count', 'opening_count_withdrawal', 'assembly_out', 'assembly_in')
  ),
  sale_line_id TEXT,
  delta INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  superseded_by_count_id TEXT,
  expires_on TEXT,
  withdraws_movement_id TEXT,
  CHECK (sale_line_id IS NULL OR kind IN ('sale', 'sale_void', 'return')),
  CHECK (expires_on IS NULL OR kind = 'opening_count'),
  CHECK (withdraws_movement_id IS NULL OR kind = 'opening_count_withdrawal')
);

INSERT INTO stock_movements_rebuilt (id, product_id, kind, sale_line_id, delta, occurred_at, superseded_by_count_id, expires_on, withdraws_movement_id)
SELECT id, product_id, kind, sale_line_id, delta, occurred_at, superseded_by_count_id, expires_on, withdraws_movement_id FROM stock_movements;

CREATE TABLE offline_fiscal_documents_rebuilt (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  point_of_sale INTEGER NOT NULL CHECK (point_of_sale BETWEEN 1 AND 99999),
  document_type TEXT NOT NULL CHECK (document_type IN ('factura_c', 'credit_note_c')),
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
  corrected_voucher_type INTEGER,
  corrected_point_of_sale INTEGER CHECK (corrected_point_of_sale BETWEEN 1 AND 99999),
  corrected_number INTEGER CHECK (corrected_number > 0),
  credit_note_id TEXT UNIQUE,
  UNIQUE (point_of_sale, document_type, number),
  CHECK (
    (
      document_type = 'credit_note_c'
      AND corrected_voucher_type IS NOT NULL
      AND corrected_point_of_sale IS NOT NULL
      AND corrected_number IS NOT NULL
      AND credit_note_id IS NOT NULL
    )
    OR (
      document_type <> 'credit_note_c'
      AND corrected_voucher_type IS NULL
      AND corrected_point_of_sale IS NULL
      AND corrected_number IS NULL
      AND credit_note_id IS NULL
    )
  )
);

INSERT INTO offline_fiscal_documents_rebuilt (
  id, sale_id, point_of_sale, document_type, number, issued_on, generated_at, generation_stamp,
  offline_authorization_code, fortnight_start, fortnight_end, document,
  buyer_document_type, buyer_document_number, cause,
  corrected_voucher_type, corrected_point_of_sale, corrected_number, credit_note_id
)
SELECT id, sale_id, point_of_sale, document_type, number, issued_on, generated_at, generation_stamp,
       offline_authorization_code, fortnight_start, fortnight_end, document,
       buyer_document_type, buyer_document_number, cause,
       corrected_voucher_type, corrected_point_of_sale, corrected_number, credit_note_id
FROM offline_fiscal_documents;

DROP TABLE return_lines;

DROP TABLE returns;

DROP TABLE payment_refunds;

DROP TABLE stock_movements;

DROP TABLE offline_fiscal_documents;

ALTER TABLE returns_rebuilt RENAME TO returns;

ALTER TABLE return_lines_rebuilt RENAME TO return_lines;

ALTER TABLE payment_refunds_rebuilt RENAME TO payment_refunds;

ALTER TABLE stock_movements_rebuilt RENAME TO stock_movements;

ALTER TABLE offline_fiscal_documents_rebuilt RENAME TO offline_fiscal_documents;

CREATE INDEX returns_by_sale ON returns (sale_id);

CREATE INDEX return_lines_by_sale_line ON return_lines (sale_line_id);

CREATE INDEX payment_refunds_by_payment ON payment_refunds (payment_id);

CREATE INDEX payment_refunds_by_return ON payment_refunds (return_id) WHERE return_id IS NOT NULL;

CREATE INDEX stock_movements_by_product ON stock_movements (product_id);

CREATE UNIQUE INDEX offline_fiscal_documents_one_invoice_per_sale
  ON offline_fiscal_documents (sale_id)
  WHERE document_type = 'factura_c';

CREATE TABLE sale_credit_notes (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  return_id TEXT UNIQUE REFERENCES returns (id),
  requested_issue_on TEXT,
  total INTEGER NOT NULL CHECK (total > 0),
  receiver_tax_status_code INTEGER,
  corrected_voucher_type INTEGER,
  corrected_point_of_sale INTEGER CHECK (corrected_point_of_sale BETWEEN 1 AND 99999),
  corrected_number INTEGER CHECK (corrected_number > 0),
  state TEXT NOT NULL CHECK (state IN ('IN_PROGRESS', 'AWAITING_INVOICE', 'AUTHORIZED', 'REJECTED', 'ALREADY_CREDITED', 'ISSUED_OFFLINE', 'REGULARIZATION_REQUIRED')),
  point_of_sale INTEGER CHECK (point_of_sale BETWEEN 1 AND 99999),
  number INTEGER CHECK (number > 0),
  issued_on TEXT,
  issued_at TEXT,
  authorization_code TEXT,
  authorization_code_due_on TEXT,
  recorded_at TEXT NOT NULL,
  answered_at TEXT,
  offline_fiscal_document_id TEXT REFERENCES offline_fiscal_documents (id),
  CHECK ((return_id IS NULL) = (requested_issue_on IS NULL)),
  CHECK (
    (receiver_tax_status_code IS NULL) = (corrected_voucher_type IS NULL)
    AND (corrected_voucher_type IS NULL) = (corrected_point_of_sale IS NULL)
    AND (corrected_point_of_sale IS NULL) = (corrected_number IS NULL)
  ),
  CHECK (
    CASE
      WHEN state = 'AWAITING_INVOICE' THEN corrected_number IS NULL
      WHEN state = 'REGULARIZATION_REQUIRED' THEN 1
      ELSE corrected_number IS NOT NULL
    END
  ),
  CHECK (return_id IS NOT NULL OR corrected_number IS NOT NULL),
  CHECK ((state IN ('IN_PROGRESS', 'AWAITING_INVOICE')) = (answered_at IS NULL)),
  CHECK ((state = 'ISSUED_OFFLINE') = (offline_fiscal_document_id IS NOT NULL)),
  CHECK (
    (
      state = 'AUTHORIZED'
      AND point_of_sale IS NOT NULL
      AND number IS NOT NULL
      AND issued_on IS NOT NULL
      AND issued_at IS NOT NULL
      AND authorization_code IS NOT NULL
      AND authorization_code_due_on IS NOT NULL
    )
    OR (
      state <> 'AUTHORIZED'
      AND point_of_sale IS NULL
      AND number IS NULL
      AND issued_on IS NULL
      AND issued_at IS NULL
      AND authorization_code IS NULL
      AND authorization_code_due_on IS NULL
    )
  )
);

INSERT INTO sale_credit_notes (
  id, sale_id, return_id, requested_issue_on, total, receiver_tax_status_code, corrected_voucher_type,
  corrected_point_of_sale, corrected_number, state, point_of_sale, number, issued_on, issued_at,
  authorization_code, authorization_code_due_on, recorded_at, answered_at, offline_fiscal_document_id
)
SELECT id, sale_id, return_id, requested_issue_on, total, receiver_tax_status_code, corrected_voucher_type,
       corrected_point_of_sale, corrected_number, state, point_of_sale, number, issued_on, issued_at,
       authorization_code, authorization_code_due_on, recorded_at, answered_at, offline_fiscal_document_id
FROM sale_credit_notes_held;

DROP TABLE sale_credit_notes_held;

CREATE UNIQUE INDEX sale_credit_notes_one_per_voided_sale
  ON sale_credit_notes (sale_id)
  WHERE return_id IS NULL;

CREATE INDEX sale_credit_notes_by_sale ON sale_credit_notes (sale_id);

CREATE INDEX sale_credit_notes_in_progress
  ON sale_credit_notes (recorded_at, id)
  WHERE state IN ('IN_PROGRESS', 'AWAITING_INVOICE');

CREATE TABLE credit_note_prints (
  credit_note_id TEXT PRIMARY KEY REFERENCES sale_credit_notes (id),
  print_attempted_at TEXT NOT NULL,
  printed_at TEXT
);

INSERT INTO credit_note_prints (credit_note_id, print_attempted_at, printed_at)
SELECT credit_note_id, print_attempted_at, printed_at FROM credit_note_prints_held;

DROP TABLE credit_note_prints_held;

CREATE TABLE credit_note_receipts (
  credit_note_id TEXT PRIMARY KEY REFERENCES sale_credit_notes (id),
  template_version TEXT NOT NULL,
  head BLOB NOT NULL,
  body BLOB NOT NULL
);

INSERT INTO credit_note_receipts (credit_note_id, template_version, head, body)
SELECT credit_note_id, template_version, head, body FROM credit_note_receipts_held;

DROP TABLE credit_note_receipts_held;

CREATE TABLE replenished_credit_note_requests (
  credit_note_id TEXT PRIMARY KEY REFERENCES sale_credit_notes (id),
  event_id TEXT NOT NULL,
  device_seq INTEGER NOT NULL CHECK (device_seq > 0),
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  payload TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  chain_hmac TEXT NOT NULL
);

INSERT INTO replenished_credit_note_requests (
  credit_note_id, event_id, device_seq, aggregate_type, aggregate_id, event_type, schema_version,
  payload, occurred_at, actor_id, chain_hmac
)
SELECT credit_note_id, event_id, device_seq, aggregate_type, aggregate_id, event_type, schema_version,
       payload, occurred_at, actor_id, chain_hmac
FROM replenished_credit_note_requests_held;

DROP TABLE replenished_credit_note_requests_held;
