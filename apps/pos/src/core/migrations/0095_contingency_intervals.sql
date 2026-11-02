CREATE TABLE contingency_intervals (
  interval_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  last_seen_at TEXT NOT NULL,
  predecessor INTEGER NOT NULL DEFAULT 0,
  device_id TEXT,
  session_closed_at TEXT
);

CREATE UNIQUE INDEX contingency_intervals_one_open ON contingency_intervals ((1)) WHERE ended_at IS NULL AND predecessor = 0;

CREATE TABLE contingency_reporting_start (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  since TEXT NOT NULL
);
