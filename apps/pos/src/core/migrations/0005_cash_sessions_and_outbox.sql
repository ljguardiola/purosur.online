CREATE TABLE cash_sessions (
  id TEXT PRIMARY KEY,
  register_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  opened_by TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  opening_float INTEGER NOT NULL CHECK (opening_float BETWEEN 0 AND 2147483647),
  closed_by TEXT,
  closed_at TEXT,
  expected_cash INTEGER,
  counted_cash INTEGER CHECK (counted_cash IS NULL OR counted_cash >= 0),
  difference INTEGER,
  state TEXT NOT NULL CHECK (state IN ('OPEN', 'CLOSED')),
  CHECK ((state = 'OPEN' AND closed_at IS NULL) OR (state = 'CLOSED' AND closed_at IS NOT NULL))
);

CREATE UNIQUE INDEX cash_sessions_one_open_per_register ON cash_sessions (register_id)
  WHERE state = 'OPEN';

CREATE TABLE cash_movements (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES cash_sessions (id),
  type TEXT NOT NULL CHECK (
    type IN ('OPENING', 'SALE', 'CHANGE', 'REFUND', 'CASH_IN', 'CASH_OUT', 'WITHDRAWAL', 'CLOSING')
  ),
  amount INTEGER NOT NULL,
  reason TEXT,
  ref_type TEXT,
  ref_id TEXT,
  actor_id TEXT NOT NULL,
  authorized_by TEXT,
  occurred_at TEXT NOT NULL
);

CREATE INDEX cash_movements_by_session ON cash_movements (session_id);

CREATE TABLE outbox (
  event_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  device_seq INTEGER NOT NULL CHECK (device_seq > 0),
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  payload TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  chain_hmac TEXT NOT NULL,
  sent_at TEXT,
  acked_at TEXT,
  UNIQUE (device_id, device_seq)
);

ALTER TABLE sync_state ADD COLUMN last_device_seq INTEGER NOT NULL DEFAULT 0 CHECK (last_device_seq >= 0);
ALTER TABLE sync_state ADD COLUMN last_chain_hmac TEXT;
