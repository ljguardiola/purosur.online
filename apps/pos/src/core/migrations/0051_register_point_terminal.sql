CREATE TABLE register_point_terminal (
  register_id TEXT PRIMARY KEY,
  assigned INTEGER NOT NULL CHECK (assigned IN (0, 1)),
  version INTEGER NOT NULL
);
