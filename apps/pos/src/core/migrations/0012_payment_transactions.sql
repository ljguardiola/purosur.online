CREATE TABLE payment_transactions (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales (id),
  kind TEXT NOT NULL CHECK (kind IN ('SALE')),
  method TEXT NOT NULL CHECK (method IN ('CASH')),
  provider TEXT NOT NULL CHECK (provider IN ('NONE')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  tendered INTEGER CHECK (tendered IS NULL OR tendered >= amount),
  state TEXT NOT NULL CHECK (state IN ('APPROVED')),
  occurred_at TEXT NOT NULL
);

CREATE INDEX payment_transactions_by_sale ON payment_transactions (sale_id);
