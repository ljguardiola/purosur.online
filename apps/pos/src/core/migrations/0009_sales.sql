CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  register_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES cash_sessions (id),
  actor_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('OPEN', 'COMPLETED', 'CANCELLED', 'VOIDED')),
  occurred_at TEXT NOT NULL
);

CREATE UNIQUE INDEX sales_one_open_per_session ON sales (session_id)
  WHERE state = 'OPEN';

CREATE TABLE sale_lines (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales (id),
  position INTEGER NOT NULL CHECK (position > 0),
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  list_unit_price INTEGER NOT NULL CHECK (list_unit_price >= 0),
  price_list_id TEXT NOT NULL,
  line_total INTEGER NOT NULL CHECK (line_total >= 0),
  UNIQUE (sale_id, position),
  UNIQUE (sale_id, product_id)
);

ALTER TABLE sync_state ADD COLUMN installation_revoked_at TEXT;
