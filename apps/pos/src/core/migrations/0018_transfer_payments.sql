CREATE TABLE payment_transactions_next (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales (id),
  kind TEXT NOT NULL CHECK (kind IN ('SALE')),
  method TEXT NOT NULL CHECK (method IN ('CASH', 'TRANSFER')),
  provider TEXT NOT NULL CHECK (provider IN ('NONE')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  tendered INTEGER CHECK (tendered IS NULL OR tendered >= amount),
  authorized_by TEXT,
  confirmed_at TEXT,
  state TEXT NOT NULL CHECK (state IN ('APPROVED')),
  occurred_at TEXT NOT NULL,
  CHECK (
    (method = 'CASH' AND authorized_by IS NULL AND confirmed_at IS NULL)
    OR (method = 'TRANSFER' AND authorized_by IS NOT NULL AND confirmed_at IS NOT NULL AND tendered IS NULL)
  )
);

INSERT INTO payment_transactions_next (id, sale_id, kind, method, provider, amount, tendered, state, occurred_at)
SELECT id, sale_id, kind, method, provider, amount, tendered, state, occurred_at FROM payment_transactions;

DROP TABLE payment_transactions;

ALTER TABLE payment_transactions_next RENAME TO payment_transactions;

CREATE INDEX payment_transactions_by_sale ON payment_transactions (sale_id);
