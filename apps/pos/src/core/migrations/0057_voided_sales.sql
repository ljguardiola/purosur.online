ALTER TABLE sales
  ADD COLUMN voided_at TEXT
  CHECK ((voided_at IS NOT NULL) = (state = 'VOIDED'));

ALTER TABLE sales
  ADD COLUMN void_authorized_by TEXT
  CHECK (void_authorized_by IS NULL OR state = 'VOIDED');

CREATE TABLE stock_movements_rebuilt (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (
    kind IN ('sale', 'sale_void', 'loss', 'adjustment', 'count', 'receipt', 'opening_count', 'opening_count_withdrawal', 'assembly_out', 'assembly_in')
  ),
  sale_line_id TEXT REFERENCES sale_lines (id),
  delta INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  superseded_by_count_id TEXT,
  expires_on TEXT,
  withdraws_movement_id TEXT,
  CHECK (sale_line_id IS NULL OR kind IN ('sale', 'sale_void')),
  CHECK (expires_on IS NULL OR kind = 'opening_count'),
  CHECK (withdraws_movement_id IS NULL OR kind = 'opening_count_withdrawal')
);

INSERT INTO stock_movements_rebuilt (id, product_id, kind, sale_line_id, delta, occurred_at, superseded_by_count_id, expires_on, withdraws_movement_id)
SELECT id, product_id, kind, sale_line_id, delta, occurred_at, superseded_by_count_id, expires_on, withdraws_movement_id FROM stock_movements;

DROP TABLE stock_movements;

ALTER TABLE stock_movements_rebuilt RENAME TO stock_movements;

CREATE INDEX stock_movements_by_product ON stock_movements (product_id);

ALTER TABLE deferred_sales
  ADD COLUMN cancelled_at TEXT
  CHECK (cancelled_at IS NULL OR satisfied_at IS NULL);
