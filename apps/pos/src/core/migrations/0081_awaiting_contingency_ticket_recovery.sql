CREATE TABLE awaiting_contingency_ticket_recovery (
  device_id TEXT PRIMARY KEY,
  last_acknowledged_seq INTEGER NOT NULL CHECK (last_acknowledged_seq >= 0)
);
