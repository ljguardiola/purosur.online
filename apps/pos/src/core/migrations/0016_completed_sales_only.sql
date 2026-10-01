DROP TABLE sale_line_removals;

DELETE FROM sale_line_promotions
  WHERE line_id IN (
    SELECT sale_lines.id FROM sale_lines
    JOIN sales ON sales.id = sale_lines.sale_id
    WHERE sales.state = 'CANCELLED'
  );
DELETE FROM sale_lines WHERE sale_id IN (SELECT id FROM sales WHERE state = 'CANCELLED');
DELETE FROM payment_transactions
  WHERE sale_id IN (SELECT id FROM sales WHERE state = 'CANCELLED');
DELETE FROM pre_emission_gate_outcomes
  WHERE sale_id IN (SELECT id FROM sales WHERE state = 'CANCELLED');
DELETE FROM sales WHERE state = 'CANCELLED';

-- Migrations run inside a transaction with foreign keys on, where they cannot be switched off;
-- deferring them lets the sales table be dropped and created again under its children.
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
  occurred_at TEXT NOT NULL
);

INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
  SELECT id, register_id, device_id, session_id, actor_id, state, occurred_at FROM sales_held;

DROP TABLE sales_held;

CREATE UNIQUE INDEX sales_one_open_per_session ON sales (session_id)
  WHERE state = 'OPEN';
