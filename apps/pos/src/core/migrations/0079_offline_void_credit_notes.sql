PRAGMA defer_foreign_keys = ON;

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
  UNIQUE (sale_id, document_type),
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
  buyer_document_type, buyer_document_number, cause
)
SELECT id, sale_id, point_of_sale, document_type, number, issued_on, generated_at, generation_stamp,
       offline_authorization_code, fortnight_start, fortnight_end, document,
       buyer_document_type, buyer_document_number, cause
FROM offline_fiscal_documents;

DROP TABLE offline_fiscal_documents;

ALTER TABLE offline_fiscal_documents_rebuilt RENAME TO offline_fiscal_documents;

CREATE TABLE offline_number_blocks_rebuilt (
  id TEXT PRIMARY KEY,
  point_of_sale INTEGER NOT NULL CHECK (point_of_sale BETWEEN 1 AND 99999),
  document_type TEXT NOT NULL CHECK (document_type IN ('factura_c', 'credit_note_c')),
  first_number INTEGER NOT NULL,
  last_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_use', 'used_up')),
  version INTEGER NOT NULL,
  UNIQUE (point_of_sale, document_type, first_number),
  CHECK (first_number >= 1 AND last_number >= first_number)
);

INSERT INTO offline_number_blocks_rebuilt (id, point_of_sale, document_type, first_number, last_number, status, version)
SELECT id, point_of_sale, document_type, first_number, last_number, status, version FROM offline_number_blocks;

DROP TABLE offline_number_blocks;

ALTER TABLE offline_number_blocks_rebuilt RENAME TO offline_number_blocks;

CREATE TABLE register_clock_marks_rebuilt (
  point_of_sale INTEGER NOT NULL CHECK (point_of_sale > 0),
  document_type TEXT NOT NULL CHECK (document_type IN ('factura_c', 'credit_note_c')),
  reading TEXT NOT NULL,
  PRIMARY KEY (point_of_sale, document_type)
);

INSERT INTO register_clock_marks_rebuilt (point_of_sale, document_type, reading)
SELECT point_of_sale, document_type, reading FROM register_clock_marks;

DROP TABLE register_clock_marks;

ALTER TABLE register_clock_marks_rebuilt RENAME TO register_clock_marks;

CREATE TABLE offline_series_counts (
  point_of_sale INTEGER NOT NULL CHECK (point_of_sale BETWEEN 1 AND 99999),
  document_type TEXT NOT NULL CHECK (document_type IN ('credit_note_c')),
  tax_authority_last_authorized_number INTEGER
    CHECK (tax_authority_last_authorized_number IS NULL OR tax_authority_last_authorized_number >= 0),
  highest_synced_offline_number INTEGER
    CHECK (highest_synced_offline_number IS NULL OR highest_synced_offline_number >= 0),
  PRIMARY KEY (point_of_sale, document_type)
);

CREATE TABLE sale_void_credit_notes_rebuilt (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL UNIQUE REFERENCES sales (id),
  total INTEGER NOT NULL CHECK (total > 0),
  receiver_tax_status_code INTEGER NOT NULL,
  corrected_voucher_type INTEGER NOT NULL,
  corrected_point_of_sale INTEGER NOT NULL CHECK (corrected_point_of_sale BETWEEN 1 AND 99999),
  corrected_number INTEGER NOT NULL CHECK (corrected_number > 0),
  state TEXT NOT NULL CHECK (state IN ('IN_PROGRESS', 'AUTHORIZED', 'REJECTED', 'ALREADY_CREDITED', 'ISSUED_OFFLINE')),
  point_of_sale INTEGER CHECK (point_of_sale BETWEEN 1 AND 99999),
  number INTEGER CHECK (number > 0),
  issued_on TEXT,
  issued_at TEXT,
  authorization_code TEXT,
  authorization_code_due_on TEXT,
  recorded_at TEXT NOT NULL,
  answered_at TEXT,
  offline_fiscal_document_id TEXT REFERENCES offline_fiscal_documents (id),
  CHECK ((state = 'IN_PROGRESS') = (answered_at IS NULL)),
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

INSERT INTO sale_void_credit_notes_rebuilt (
  id, sale_id, total, receiver_tax_status_code, corrected_voucher_type, corrected_point_of_sale,
  corrected_number, state, point_of_sale, number, issued_on, issued_at, authorization_code,
  authorization_code_due_on, recorded_at, answered_at
)
SELECT id, sale_id, total, receiver_tax_status_code, corrected_voucher_type, corrected_point_of_sale,
       corrected_number, state, point_of_sale, number, issued_on, issued_at, authorization_code,
       authorization_code_due_on, recorded_at, answered_at
FROM sale_void_credit_notes;

DROP INDEX sale_void_credit_notes_in_progress;

DROP TABLE sale_void_credit_notes;

ALTER TABLE sale_void_credit_notes_rebuilt RENAME TO sale_void_credit_notes;

CREATE INDEX sale_void_credit_notes_in_progress
  ON sale_void_credit_notes (recorded_at, id)
  WHERE state = 'IN_PROGRESS';
