CREATE TABLE contingency_backup_tickets (
  id TEXT PRIMARY KEY,
  operation TEXT NOT NULL CHECK (
    operation IN (
      'sale',
      'paid_sale_cancellation',
      'sale_void',
      'cash_movement',
      'cash_session_opening',
      'cash_session_closing',
      'initial_count',
      'clock_correction',
      'reprint'
    )
  ),
  subject_id TEXT,
  first_device_seq INTEGER NOT NULL CHECK (first_device_seq > 0),
  last_device_seq INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  key_version INTEGER,
  qr_codes TEXT,
  printed_at TEXT,
  discarded_at TEXT,
  CHECK (last_device_seq >= first_device_seq),
  CHECK ((key_version IS NULL) = (qr_codes IS NULL))
);

CREATE INDEX contingency_backup_tickets_by_creation
  ON contingency_backup_tickets (created_at, id);
