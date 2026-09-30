CREATE TABLE remembered_users (
  user_id TEXT PRIMARY KEY REFERENCES users (id),
  remembered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
