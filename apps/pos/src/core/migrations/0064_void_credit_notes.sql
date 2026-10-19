CREATE TABLE sale_void_credit_notes (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL UNIQUE REFERENCES sales (id),
  total INTEGER NOT NULL CHECK (total > 0),
  receiver_tax_status_code INTEGER NOT NULL,
  corrected_voucher_type INTEGER NOT NULL,
  corrected_point_of_sale INTEGER NOT NULL CHECK (corrected_point_of_sale BETWEEN 1 AND 99999),
  corrected_number INTEGER NOT NULL CHECK (corrected_number > 0),
  state TEXT NOT NULL CHECK (state IN ('IN_PROGRESS', 'AUTHORIZED', 'REJECTED', 'ALREADY_CREDITED')),
  point_of_sale INTEGER CHECK (point_of_sale BETWEEN 1 AND 99999),
  number INTEGER CHECK (number > 0),
  issued_on TEXT,
  authorization_code TEXT,
  authorization_code_due_on TEXT,
  recorded_at TEXT NOT NULL,
  answered_at TEXT,
  CHECK ((state = 'IN_PROGRESS') = (answered_at IS NULL)),
  CHECK (
    (
      state = 'AUTHORIZED'
      AND point_of_sale IS NOT NULL
      AND number IS NOT NULL
      AND issued_on IS NOT NULL
      AND authorization_code IS NOT NULL
      AND authorization_code_due_on IS NOT NULL
    )
    OR (
      state <> 'AUTHORIZED'
      AND point_of_sale IS NULL
      AND number IS NULL
      AND issued_on IS NULL
      AND authorization_code IS NULL
      AND authorization_code_due_on IS NULL
    )
  )
);

CREATE INDEX sale_void_credit_notes_in_progress
  ON sale_void_credit_notes (recorded_at, id)
  WHERE state = 'IN_PROGRESS';
