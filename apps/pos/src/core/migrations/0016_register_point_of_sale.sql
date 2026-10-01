CREATE TABLE register_point_of_sale (
  register_id TEXT PRIMARY KEY,
  point_of_sale_number INTEGER NOT NULL CHECK (point_of_sale_number BETWEEN 1 AND 99999),
  fiscal_address_id TEXT NOT NULL,
  version INTEGER NOT NULL
);
