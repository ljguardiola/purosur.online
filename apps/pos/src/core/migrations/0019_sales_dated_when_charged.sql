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
  state TEXT NOT NULL CHECK (state IN ('OPEN', 'COMPLETED', 'VOIDED')),
  occurred_at TEXT,
  CHECK ((state = 'OPEN') = (occurred_at IS NULL))
);

INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
  SELECT
    sales_held.id, sales_held.register_id, sales_held.device_id, sales_held.session_id,
    sales_held.actor_id, sales_held.state,
    CASE
      WHEN sales_held.state = 'OPEN' THEN NULL
      ELSE coalesce(
        (SELECT min(payment_transactions.occurred_at) FROM payment_transactions
           WHERE payment_transactions.sale_id = sales_held.id AND payment_transactions.kind = 'SALE'
             AND payment_transactions.state = 'APPROVED'),
        sales_held.occurred_at
      )
    END
  FROM sales_held;

DROP TABLE sales_held;

CREATE UNIQUE INDEX sales_one_open_per_session ON sales (session_id)
  WHERE state = 'OPEN';
