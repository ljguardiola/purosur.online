CREATE TABLE sale_line_removals (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales (id),
  sale_line_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  qty_removed INTEGER NOT NULL CHECK (qty_removed > 0),
  amount_removed INTEGER NOT NULL,
  actor_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX sale_line_removals_by_sale ON sale_line_removals (sale_id, occurred_at);
