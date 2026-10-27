PRAGMA defer_foreign_keys = ON;

CREATE TABLE sale_void_credit_notes_held AS
  SELECT id, sale_id, total, receiver_tax_status_code, corrected_voucher_type, corrected_point_of_sale,
         corrected_number, state, point_of_sale, number, issued_on, issued_at, authorization_code,
         authorization_code_due_on, recorded_at, answered_at, offline_fiscal_document_id
  FROM sale_void_credit_notes;

CREATE TABLE credit_note_prints_held AS
  SELECT notes.id AS credit_note_id, prints.print_attempted_at, prints.printed_at
  FROM credit_note_prints AS prints
  JOIN sale_void_credit_notes AS notes ON notes.sale_id = prints.sale_id;

CREATE TABLE credit_note_receipts_held AS
  SELECT notes.id AS credit_note_id, receipts.template_version, receipts.head, receipts.body
  FROM credit_note_receipts AS receipts
  JOIN sale_void_credit_notes AS notes ON notes.sale_id = receipts.sale_id;

DROP TABLE credit_note_prints;

DROP TABLE credit_note_receipts;

DROP INDEX sale_void_credit_notes_in_progress;

DROP TABLE sale_void_credit_notes;

CREATE TABLE offline_fiscal_documents_rebuilt (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales (id),
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

DROP TABLE offline_fiscal_documents;

ALTER TABLE offline_fiscal_documents_rebuilt RENAME TO offline_fiscal_documents;

CREATE UNIQUE INDEX offline_fiscal_documents_one_invoice_per_sale
  ON offline_fiscal_documents (sale_id)
  WHERE document_type = 'factura_c';

CREATE TABLE sale_void_credit_notes (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales (id),
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

INSERT INTO sale_void_credit_notes (
  id, sale_id, total, receiver_tax_status_code, corrected_voucher_type, corrected_point_of_sale,
  corrected_number, state, point_of_sale, number, issued_on, issued_at, authorization_code,
  authorization_code_due_on, recorded_at, answered_at, offline_fiscal_document_id
)
SELECT id, sale_id, total, receiver_tax_status_code, corrected_voucher_type, corrected_point_of_sale,
       corrected_number, state, point_of_sale, number, issued_on, issued_at, authorization_code,
       authorization_code_due_on, recorded_at, answered_at, offline_fiscal_document_id
FROM sale_void_credit_notes_held;

DROP TABLE sale_void_credit_notes_held;

CREATE UNIQUE INDEX sale_void_credit_notes_one_per_voided_sale
  ON sale_void_credit_notes (sale_id)
  WHERE return_id IS NULL;

CREATE INDEX sale_void_credit_notes_by_sale ON sale_void_credit_notes (sale_id);

CREATE INDEX sale_void_credit_notes_in_progress
  ON sale_void_credit_notes (recorded_at, id)
  WHERE state IN ('IN_PROGRESS', 'AWAITING_INVOICE');

CREATE TABLE credit_note_prints (
  credit_note_id TEXT PRIMARY KEY REFERENCES sale_void_credit_notes (id),
  print_attempted_at TEXT NOT NULL,
  printed_at TEXT
);

INSERT INTO credit_note_prints (credit_note_id, print_attempted_at, printed_at)
SELECT credit_note_id, print_attempted_at, printed_at FROM credit_note_prints_held;

DROP TABLE credit_note_prints_held;

CREATE TABLE credit_note_receipts (
  credit_note_id TEXT PRIMARY KEY REFERENCES sale_void_credit_notes (id),
  template_version TEXT NOT NULL,
  head BLOB NOT NULL,
  body BLOB NOT NULL
);

INSERT INTO credit_note_receipts (credit_note_id, template_version, head, body)
SELECT credit_note_id, template_version, head, body FROM credit_note_receipts_held;

DROP TABLE credit_note_receipts_held;
