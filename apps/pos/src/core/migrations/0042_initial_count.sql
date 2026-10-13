CREATE TABLE stock_movements_rebuilt (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (
    kind IN ('sale', 'loss', 'adjustment', 'count', 'receipt', 'opening_count', 'opening_count_withdrawal')
  ),
  sale_line_id TEXT REFERENCES sale_lines (id),
  delta INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  superseded_by_count_id TEXT,
  expires_on TEXT,
  withdraws_movement_id TEXT,
  CHECK (sale_line_id IS NULL OR kind = 'sale'),
  CHECK (expires_on IS NULL OR kind = 'opening_count'),
  CHECK (withdraws_movement_id IS NULL OR kind = 'opening_count_withdrawal')
);

INSERT INTO stock_movements_rebuilt (id, product_id, kind, sale_line_id, delta, occurred_at, superseded_by_count_id)
SELECT id, product_id, kind, sale_line_id, delta, occurred_at, superseded_by_count_id FROM stock_movements;

DROP TABLE stock_movements;

ALTER TABLE stock_movements_rebuilt RENAME TO stock_movements;

CREATE INDEX stock_movements_by_product ON stock_movements (product_id);

CREATE TABLE branch_first_cash_sessions (
  location_id TEXT PRIMARY KEY,
  opened_at TEXT NOT NULL
);

INSERT INTO pulled_table_redeliveries (table_name) VALUES ('branch_first_cash_sessions')
  ON CONFLICT (table_name) DO UPDATE SET cursor = 0;

INSERT INTO pulled_table_redeliveries (table_name) VALUES ('stock_movements')
  ON CONFLICT (table_name) DO UPDATE SET cursor = 0;
