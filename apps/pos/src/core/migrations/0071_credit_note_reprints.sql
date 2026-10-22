CREATE TABLE sale_reprints_by_document (
  sale_id TEXT NOT NULL REFERENCES sales (id),
  document TEXT NOT NULL CHECK (document IN ('sale_receipt', 'credit_note')),
  order_number INTEGER NOT NULL CHECK (order_number >= 1),
  requested_by TEXT NOT NULL,
  authorized_by TEXT,
  reason_kind TEXT NOT NULL CHECK (reason_kind IN ('retry', 'requested')),
  reason_text TEXT,
  occurred_at TEXT NOT NULL,
  PRIMARY KEY (sale_id, document, order_number),
  CHECK ((reason_kind = 'requested') = (reason_text IS NOT NULL))
);

INSERT INTO sale_reprints_by_document (
  sale_id, document, order_number, requested_by, authorized_by, reason_kind, reason_text, occurred_at
)
SELECT sale_id, 'sale_receipt', order_number, requested_by, authorized_by, reason_kind, reason_text,
       occurred_at
FROM sale_reprints;

DROP TABLE sale_reprints;
ALTER TABLE sale_reprints_by_document RENAME TO sale_reprints;

CREATE TABLE credit_note_prints (
  sale_id TEXT PRIMARY KEY REFERENCES sales (id),
  print_attempted_at TEXT NOT NULL,
  printed_at TEXT
);

CREATE TABLE credit_note_receipts (
  sale_id TEXT PRIMARY KEY REFERENCES sales (id),
  template_version TEXT NOT NULL,
  head BLOB NOT NULL,
  body BLOB NOT NULL
);
