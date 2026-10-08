PRAGMA defer_foreign_keys = ON;

CREATE TABLE sales_held AS
  SELECT id, register_id, device_id, session_id, actor_id, state, occurred_at FROM sales;

DROP TABLE sales;

CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  register_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES cash_sessions (id),
  actor_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('OPEN', 'COMPLETED', 'VOIDED', 'CANCELLED')),
  occurred_at TEXT,
  cancellation_authorized_by TEXT,
  CHECK ((state = 'OPEN') = (occurred_at IS NULL)),
  CHECK (cancellation_authorized_by IS NULL OR state = 'CANCELLED')
);

INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
  SELECT id, register_id, device_id, session_id, actor_id, state, occurred_at FROM sales_held;

DROP TABLE sales_held;

CREATE UNIQUE INDEX sales_one_open_per_session ON sales (session_id)
  WHERE state = 'OPEN';

CREATE TABLE payment_refunds (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payment_transactions (id),
  method TEXT NOT NULL CHECK (method IN ('CASH', 'TRANSFER')),
  provider TEXT NOT NULL CHECK (provider IN ('NONE')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  state TEXT NOT NULL CHECK (state IN ('APPROVED', 'PENDING')),
  occurred_at TEXT NOT NULL
);

CREATE INDEX payment_refunds_by_payment ON payment_refunds (payment_id);
