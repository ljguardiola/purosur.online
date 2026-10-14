CREATE TABLE paid_orders_without_sale (
  payment_transaction_id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('QR', 'POINT')),
  provider TEXT NOT NULL CHECK (provider IN ('MERCADOPAGO_QR', 'MERCADOPAGO_POINT')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  created_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  resolved_at TEXT,
  CHECK (
    (method = 'QR' AND provider = 'MERCADOPAGO_QR')
    OR (method = 'POINT' AND provider = 'MERCADOPAGO_POINT')
  )
);
