PRAGMA defer_foreign_keys = ON;

CREATE TABLE returns_rebuilt (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  register_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES cash_sessions (id),
  actor_id TEXT NOT NULL,
  authorized_by TEXT,
  ticket_source TEXT NOT NULL CHECK (ticket_source IN ('QR', 'TYPED', 'HISTORY')),
  occurred_at TEXT NOT NULL
);

INSERT INTO returns_rebuilt (id, sale_id, register_id, device_id, session_id, actor_id, authorized_by, ticket_source, occurred_at)
SELECT id, sale_id, register_id, device_id, session_id, actor_id, authorized_by, ticket_source, occurred_at FROM returns;

DROP TABLE returns;

ALTER TABLE returns_rebuilt RENAME TO returns;

CREATE INDEX returns_by_sale ON returns (sale_id);
