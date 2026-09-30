CREATE TABLE pin_sign_in_failures (
  user_id TEXT PRIMARY KEY REFERENCES users (id),
  consecutive_failures INTEGER NOT NULL CHECK (consecutive_failures > 0),
  last_failed_at TEXT NOT NULL
);
