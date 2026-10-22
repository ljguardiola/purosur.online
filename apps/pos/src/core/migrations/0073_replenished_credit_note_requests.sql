CREATE TABLE replenished_credit_note_requests (
  credit_note_id TEXT PRIMARY KEY REFERENCES sale_void_credit_notes (id),
  event_id TEXT NOT NULL,
  device_seq INTEGER NOT NULL CHECK (device_seq > 0),
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  payload TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  chain_hmac TEXT NOT NULL
);
