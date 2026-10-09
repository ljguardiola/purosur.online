PRAGMA defer_foreign_keys = ON;

CREATE TABLE payment_transactions_held AS
  SELECT id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state,
         occurred_at
  FROM payment_transactions;

DROP TABLE payment_transactions;

CREATE TABLE payment_transactions (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales (id),
  kind TEXT NOT NULL CHECK (kind IN ('SALE')),
  method TEXT NOT NULL CHECK (method IN ('CASH', 'TRANSFER', 'QR')),
  provider TEXT NOT NULL CHECK (provider IN ('NONE', 'MERCADOPAGO_QR')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  tendered INTEGER CHECK (tendered IS NULL OR tendered >= amount),
  authorized_by TEXT,
  confirmed_at TEXT,
  state TEXT NOT NULL
    CHECK (state IN ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED', 'EXPIRED')),
  occurred_at TEXT NOT NULL,
  wait_ends_at TEXT,
  CHECK (
    (method = 'CASH' AND provider = 'NONE' AND state = 'APPROVED'
      AND authorized_by IS NULL AND confirmed_at IS NULL AND wait_ends_at IS NULL)
    OR (method = 'TRANSFER' AND provider = 'NONE' AND state = 'APPROVED'
      AND authorized_by IS NOT NULL AND confirmed_at IS NOT NULL AND tendered IS NULL
      AND wait_ends_at IS NULL)
    OR (method = 'QR' AND provider = 'MERCADOPAGO_QR' AND tendered IS NULL
      AND authorized_by IS NULL AND confirmed_at IS NULL AND wait_ends_at IS NOT NULL)
  )
);

INSERT INTO payment_transactions (
  id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state,
  occurred_at
)
  SELECT id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state,
         occurred_at
  FROM payment_transactions_held;

DROP TABLE payment_transactions_held;

CREATE INDEX payment_transactions_by_sale ON payment_transactions (sale_id);
