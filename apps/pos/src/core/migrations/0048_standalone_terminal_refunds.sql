PRAGMA defer_foreign_keys = ON;

CREATE TABLE payment_refunds_held AS
  SELECT id, payment_id, method, provider, amount, state, occurred_at
  FROM payment_refunds;

DROP TABLE payment_refunds;

CREATE TABLE payment_refunds (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payment_transactions (id),
  method TEXT NOT NULL CHECK (method IN ('CASH', 'TRANSFER', 'STANDALONE_TERMINAL')),
  provider TEXT NOT NULL CHECK (provider IN ('NONE', 'EXTERNAL_TERMINAL')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  state TEXT NOT NULL CHECK (state IN ('APPROVED', 'PENDING')),
  occurred_at TEXT NOT NULL,
  CHECK (
    (method = 'STANDALONE_TERMINAL' AND provider = 'EXTERNAL_TERMINAL' AND state = 'PENDING')
    OR (method <> 'STANDALONE_TERMINAL' AND provider = 'NONE')
  )
);

INSERT INTO payment_refunds (id, payment_id, method, provider, amount, state, occurred_at)
  SELECT id, payment_id, method, provider, amount, state, occurred_at
  FROM payment_refunds_held;

DROP TABLE payment_refunds_held;

CREATE INDEX payment_refunds_by_payment ON payment_refunds (payment_id);
