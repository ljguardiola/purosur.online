CREATE TABLE stock_movements_rebuilt (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (
    kind IN ('sale', 'sale_void', 'return', 'loss', 'adjustment', 'count', 'receipt', 'opening_count', 'opening_count_withdrawal', 'assembly_out', 'assembly_in')
  ),
  sale_line_id TEXT REFERENCES sale_lines (id),
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

DROP TABLE stock_movements;

ALTER TABLE stock_movements_rebuilt RENAME TO stock_movements;

CREATE INDEX stock_movements_by_product ON stock_movements (product_id);

CREATE TABLE returns (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales (id),
  register_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES cash_sessions (id),
  actor_id TEXT NOT NULL,
  authorized_by TEXT,
  ticket_source TEXT NOT NULL CHECK (ticket_source IN ('QR', 'TYPED')),
  occurred_at TEXT NOT NULL
);

CREATE INDEX returns_by_sale ON returns (sale_id);

CREATE TABLE return_lines (
  return_id TEXT NOT NULL REFERENCES returns (id),
  sale_line_id TEXT NOT NULL REFERENCES sale_lines (id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reason TEXT NOT NULL CHECK (reason IN ('change_of_mind', 'defective')),
  disposition TEXT NOT NULL CHECK (disposition IN ('restock', 'discard')),
  refunded_amount INTEGER NOT NULL CHECK (refunded_amount >= 0),
  PRIMARY KEY (return_id, sale_line_id)
);

CREATE INDEX return_lines_by_sale_line ON return_lines (sale_line_id);
