CREATE TABLE stock_movements_rebuilt (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('sale', 'loss', 'adjustment', 'count')),
  sale_line_id TEXT REFERENCES sale_lines (id),
  delta INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  superseded_by_count_id TEXT,
  CHECK (sale_line_id IS NULL OR kind = 'sale')
);

INSERT INTO stock_movements_rebuilt (id, product_id, kind, sale_line_id, delta, occurred_at)
SELECT id, product_id, kind, sale_line_id, delta, occurred_at FROM stock_movements;

DROP TABLE stock_movements;

ALTER TABLE stock_movements_rebuilt RENAME TO stock_movements;

CREATE INDEX stock_movements_by_product ON stock_movements (product_id);
