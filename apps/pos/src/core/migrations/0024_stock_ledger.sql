CREATE TABLE stock_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('sale')),
  sale_line_id TEXT REFERENCES sale_lines (id),
  delta INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  CHECK ((kind = 'sale') = (sale_line_id IS NOT NULL))
);

CREATE INDEX stock_movements_by_product ON stock_movements (product_id);

CREATE TABLE stock_balances (
  product_id TEXT PRIMARY KEY,
  quantity INTEGER NOT NULL
);
