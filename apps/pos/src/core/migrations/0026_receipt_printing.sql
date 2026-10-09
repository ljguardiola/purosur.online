ALTER TABLE sales ADD COLUMN print_attempted_at TEXT;
ALTER TABLE sales ADD COLUMN printed_at TEXT;

CREATE TABLE sale_receipts (
  sale_id TEXT PRIMARY KEY REFERENCES sales (id),
  template_version TEXT NOT NULL,
  head BLOB NOT NULL,
  body BLOB NOT NULL
);

CREATE TABLE sale_reprints (
  sale_id TEXT NOT NULL REFERENCES sales (id),
  order_number INTEGER NOT NULL CHECK (order_number >= 1),
  requested_by TEXT NOT NULL,
  authorized_by TEXT,
  reason_kind TEXT NOT NULL CHECK (reason_kind IN ('retry', 'requested')),
  reason_text TEXT,
  occurred_at TEXT NOT NULL,
  PRIMARY KEY (sale_id, order_number),
  CHECK ((reason_kind = 'requested') = (reason_text IS NOT NULL))
);
