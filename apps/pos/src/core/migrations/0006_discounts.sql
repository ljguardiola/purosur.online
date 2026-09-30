CREATE TABLE discounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  percent INTEGER,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL,
  weekdays TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  version INTEGER NOT NULL,
  removed INTEGER NOT NULL DEFAULT 0 CHECK (removed IN (0, 1))
);
