CREATE TABLE sale_reprints_by_credit_note (
  sale_id TEXT NOT NULL REFERENCES sales (id),
  document TEXT NOT NULL CHECK (document IN ('sale_receipt', 'credit_note', 'deferred_invoice')),
  credit_note_id TEXT REFERENCES sale_credit_notes (id),
  order_number INTEGER NOT NULL CHECK (order_number >= 1),
  requested_by TEXT NOT NULL,
  authorized_by TEXT,
  reason_kind TEXT NOT NULL CHECK (reason_kind IN ('retry', 'requested')),
  reason_text TEXT,
  occurred_at TEXT NOT NULL,
  CHECK ((reason_kind = 'requested') = (reason_text IS NOT NULL)),
  CHECK ((document = 'credit_note') = (credit_note_id IS NOT NULL))
);

INSERT INTO sale_reprints_by_credit_note (
  sale_id, document, credit_note_id, order_number, requested_by, authorized_by, reason_kind,
  reason_text, occurred_at
)
SELECT reprints.sale_id, reprints.document,
       CASE reprints.document
         WHEN 'credit_note' THEN (
           SELECT notes.id FROM sale_credit_notes AS notes
           WHERE notes.sale_id = reprints.sale_id AND notes.return_id IS NULL
         )
       END,
       reprints.order_number, reprints.requested_by, reprints.authorized_by, reprints.reason_kind,
       reprints.reason_text, reprints.occurred_at
FROM sale_reprints AS reprints;

DROP TABLE sale_reprints;
ALTER TABLE sale_reprints_by_credit_note RENAME TO sale_reprints;

CREATE UNIQUE INDEX sale_reprints_once_per_order
  ON sale_reprints (sale_id, document, IFNULL(credit_note_id, ''), order_number);
