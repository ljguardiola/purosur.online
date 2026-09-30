CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  version INTEGER NOT NULL,
  removed INTEGER NOT NULL DEFAULT 0 CHECK (removed IN (0, 1))
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT NOT NULL,
  brand_id TEXT,
  sale_unit TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  net_content_quantity REAL,
  net_content_unit TEXT,
  version INTEGER NOT NULL,
  removed INTEGER NOT NULL DEFAULT 0 CHECK (removed IN (0, 1))
);

CREATE TABLE product_barcodes (
  product_id TEXT NOT NULL REFERENCES products (id),
  position INTEGER NOT NULL,
  code TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  PRIMARY KEY (product_id, position)
);

CREATE TABLE price_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version INTEGER NOT NULL
);

CREATE TABLE prices (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  price_list_id TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  valid_from TEXT NOT NULL,
  version INTEGER NOT NULL,
  removed INTEGER NOT NULL DEFAULT 0 CHECK (removed IN (0, 1))
);
