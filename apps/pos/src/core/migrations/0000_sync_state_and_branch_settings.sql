CREATE TABLE sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  pull_cursor INTEGER NOT NULL CHECK (pull_cursor >= 0),
  device_id TEXT
);

INSERT INTO sync_state (id, pull_cursor) VALUES (1, 0);

CREATE TABLE branch_settings (
  location_id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL,
  instagram_handle TEXT NOT NULL,
  weekly_hours TEXT NOT NULL,
  expiring_lot_alert_days INTEGER NOT NULL,
  unreviewed_price_alert_days INTEGER NOT NULL,
  good_condition_return_days INTEGER NOT NULL,
  version INTEGER NOT NULL
);
