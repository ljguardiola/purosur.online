CREATE TABLE contingency_intervals (
  interval_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  last_seen_at TEXT NOT NULL
);

CREATE UNIQUE INDEX contingency_intervals_one_open ON contingency_intervals ((1)) WHERE ended_at IS NULL;

CREATE TABLE contingency_reporting_start (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  since TEXT NOT NULL
);
