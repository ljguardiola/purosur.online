CREATE TABLE register_qr_point_of_sale (
  register_id TEXT PRIMARY KEY,
  assigned INTEGER NOT NULL CHECK (assigned IN (0, 1)),
  version INTEGER NOT NULL
);
