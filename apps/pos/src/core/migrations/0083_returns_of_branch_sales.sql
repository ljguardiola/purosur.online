PRAGMA defer_foreign_keys = ON;

CREATE TABLE branch_sales_for_return (
  sale_id TEXT PRIMARY KEY,
  facts TEXT NOT NULL CHECK (json_valid(facts))
);

CREATE TABLE returns_rebuilt (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  register_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES cash_sessions (id),
  actor_id TEXT NOT NULL,
  authorized_by TEXT,
  ticket_source TEXT NOT NULL CHECK (ticket_source IN ('QR', 'TYPED')),
  occurred_at TEXT NOT NULL
);

INSERT INTO returns_rebuilt (id, sale_id, register_id, device_id, session_id, actor_id, authorized_by, ticket_source, occurred_at)
SELECT id, sale_id, register_id, device_id, session_id, actor_id, authorized_by, ticket_source, occurred_at FROM returns;

CREATE TABLE return_lines_rebuilt (
  return_id TEXT NOT NULL REFERENCES returns_rebuilt (id),
  sale_line_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reason TEXT NOT NULL CHECK (reason IN ('change_of_mind', 'defective')),
  disposition TEXT NOT NULL CHECK (disposition IN ('restock', 'discard')),
  refunded_amount INTEGER NOT NULL CHECK (refunded_amount >= 0),
  PRIMARY KEY (return_id, sale_line_id)
);

INSERT INTO return_lines_rebuilt (return_id, sale_line_id, quantity, reason, disposition, refunded_amount)
SELECT return_id, sale_line_id, quantity, reason, disposition, refunded_amount FROM return_lines;

CREATE TABLE payment_refunds_rebuilt (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  return_id TEXT REFERENCES returns_rebuilt (id),
  method TEXT NOT NULL CHECK (method IN ('CASH', 'TRANSFER', 'STANDALONE_TERMINAL', 'QR', 'POINT')),
  provider TEXT NOT NULL CHECK (provider IN ('NONE', 'EXTERNAL_TERMINAL', 'MERCADOPAGO_QR', 'MERCADOPAGO_POINT')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  state TEXT NOT NULL CHECK (state IN ('APPROVED', 'PENDING')),
  occurred_at TEXT NOT NULL,
  CHECK (
    (method = 'STANDALONE_TERMINAL' AND provider = 'EXTERNAL_TERMINAL' AND state = 'PENDING')
    OR (method = 'QR' AND provider = 'MERCADOPAGO_QR' AND state = 'PENDING')
    OR (method = 'POINT' AND provider = 'MERCADOPAGO_POINT' AND state = 'PENDING')
    OR (method NOT IN ('STANDALONE_TERMINAL', 'QR', 'POINT') AND provider = 'NONE')
  )
);

INSERT INTO payment_refunds_rebuilt (id, payment_id, method, provider, amount, state, occurred_at)
SELECT id, payment_id, method, provider, amount, state, occurred_at FROM payment_refunds;

CREATE TABLE stock_movements_rebuilt (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (
    kind IN ('sale', 'sale_void', 'return', 'loss', 'adjustment', 'count', 'receipt', 'opening_count', 'opening_count_withdrawal', 'assembly_out', 'assembly_in')
  ),
  sale_line_id TEXT,
  delta INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  superseded_by_count_id TEXT,
  expires_on TEXT,
  withdraws_movement_id TEXT,
  CHECK (sale_line_id IS NULL OR kind IN ('sale', 'sale_void', 'return')),
  CHECK (expires_on IS NULL OR kind = 'opening_count'),
  CHECK (withdraws_movement_id IS NULL OR kind = 'opening_count_withdrawal')
);

INSERT INTO stock_movements_rebuilt (id, product_id, kind, sale_line_id, delta, occurred_at, superseded_by_count_id, expires_on, withdraws_movement_id)
SELECT id, product_id, kind, sale_line_id, delta, occurred_at, superseded_by_count_id, expires_on, withdraws_movement_id FROM stock_movements;

DROP TABLE return_lines;

DROP TABLE returns;

DROP TABLE payment_refunds;

DROP TABLE stock_movements;

ALTER TABLE returns_rebuilt RENAME TO returns;

ALTER TABLE return_lines_rebuilt RENAME TO return_lines;

ALTER TABLE payment_refunds_rebuilt RENAME TO payment_refunds;

ALTER TABLE stock_movements_rebuilt RENAME TO stock_movements;

CREATE INDEX returns_by_sale ON returns (sale_id);

CREATE INDEX return_lines_by_sale_line ON return_lines (sale_line_id);

CREATE INDEX payment_refunds_by_payment ON payment_refunds (payment_id);

CREATE INDEX stock_movements_by_product ON stock_movements (product_id);
