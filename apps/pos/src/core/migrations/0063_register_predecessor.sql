CREATE TABLE register_predecessor (
  device_id TEXT PRIMARY KEY,
  last_acknowledged_seq INTEGER NOT NULL CHECK (last_acknowledged_seq >= 0)
);
