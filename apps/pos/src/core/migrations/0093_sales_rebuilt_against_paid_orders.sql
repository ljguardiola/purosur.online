ALTER TABLE paid_orders_without_sale ADD COLUMN card_type TEXT
  CHECK (card_type IS NULL OR (card_type IN ('DEBIT', 'CREDIT') AND method = 'POINT'));

CREATE TABLE sales_rebuilt_against_paid_orders (
  sale_id TEXT PRIMARY KEY REFERENCES sales (id),
  payment_transaction_id TEXT NOT NULL UNIQUE REFERENCES paid_orders_without_sale (payment_transaction_id)
);
