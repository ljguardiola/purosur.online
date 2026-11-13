CREATE TABLE returns_rebuilt (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  register_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES cash_sessions (id),
  actor_id TEXT NOT NULL,
  authorized_by TEXT,
  ticket_source TEXT NOT NULL CHECK (ticket_source IN ('QR', 'TYPED', 'HISTORY')),
  occurred_at TEXT NOT NULL
);

INSERT INTO returns_rebuilt (id, sale_id, register_id, device_id, session_id, actor_id, authorized_by, ticket_source, occurred_at)
SELECT id, sale_id, register_id, device_id, session_id, actor_id, authorized_by, ticket_source, occurred_at FROM returns;

CREATE TABLE return_lines_held AS SELECT * FROM return_lines;

CREATE TABLE payment_refunds_held AS SELECT * FROM payment_refunds WHERE return_id IS NOT NULL;

CREATE TABLE sale_credit_notes_held AS SELECT * FROM sale_credit_notes WHERE return_id IS NOT NULL;

CREATE TABLE credit_note_prints_held AS
SELECT * FROM credit_note_prints WHERE credit_note_id IN (SELECT id FROM sale_credit_notes_held);

CREATE TABLE credit_note_receipts_held AS
SELECT * FROM credit_note_receipts WHERE credit_note_id IN (SELECT id FROM sale_credit_notes_held);

CREATE TABLE replenished_credit_note_requests_held AS
SELECT * FROM replenished_credit_note_requests WHERE credit_note_id IN (SELECT id FROM sale_credit_notes_held);

CREATE TABLE sale_reprints_held AS
SELECT * FROM sale_reprints WHERE credit_note_id IN (SELECT id FROM sale_credit_notes_held);

DELETE FROM credit_note_prints WHERE credit_note_id IN (SELECT id FROM sale_credit_notes_held);

DELETE FROM credit_note_receipts WHERE credit_note_id IN (SELECT id FROM sale_credit_notes_held);

DELETE FROM replenished_credit_note_requests WHERE credit_note_id IN (SELECT id FROM sale_credit_notes_held);

DELETE FROM sale_reprints WHERE credit_note_id IN (SELECT id FROM sale_credit_notes_held);

DELETE FROM sale_credit_notes WHERE id IN (SELECT id FROM sale_credit_notes_held);

DELETE FROM return_lines;

DELETE FROM payment_refunds WHERE id IN (SELECT id FROM payment_refunds_held);

DROP TABLE returns;

ALTER TABLE returns_rebuilt RENAME TO returns;

CREATE INDEX returns_by_sale ON returns (sale_id);

INSERT INTO return_lines SELECT * FROM return_lines_held;

INSERT INTO payment_refunds SELECT * FROM payment_refunds_held;

INSERT INTO sale_credit_notes SELECT * FROM sale_credit_notes_held;

INSERT INTO credit_note_prints SELECT * FROM credit_note_prints_held;

INSERT INTO credit_note_receipts SELECT * FROM credit_note_receipts_held;

INSERT INTO replenished_credit_note_requests SELECT * FROM replenished_credit_note_requests_held;

INSERT INTO sale_reprints SELECT * FROM sale_reprints_held;

DROP TABLE return_lines_held;

DROP TABLE payment_refunds_held;

DROP TABLE sale_credit_notes_held;

DROP TABLE credit_note_prints_held;

DROP TABLE credit_note_receipts_held;

DROP TABLE replenished_credit_note_requests_held;

DROP TABLE sale_reprints_held;
