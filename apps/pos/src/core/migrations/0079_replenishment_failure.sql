CREATE TABLE register_predecessor_with_failure (
  device_id TEXT PRIMARY KEY,
  last_acknowledged_seq INTEGER NOT NULL CHECK (last_acknowledged_seq >= 0),
  failure_kind TEXT CHECK (failure_kind IN ('refused', 'unreadable_event')),
  failure_refusal TEXT CHECK (
    failure_refusal IN ('predecessor_not_of_register', 'predecessor_not_revoked', 'cursor_not_of_replenishment')
  ),
  failure_event_id TEXT,
  failure_reason TEXT,
  failure_app_version TEXT,
  CHECK (
    (failure_kind IS NULL
      AND failure_refusal IS NULL AND failure_event_id IS NULL
      AND failure_reason IS NULL AND failure_app_version IS NULL)
    OR (failure_kind = 'refused'
      AND failure_refusal IS NOT NULL AND failure_event_id IS NULL
      AND failure_reason IS NULL AND failure_app_version IS NULL)
    OR (failure_kind = 'unreadable_event'
      AND failure_refusal IS NULL AND failure_event_id IS NOT NULL AND failure_reason IS NOT NULL)
  )
);

INSERT INTO register_predecessor_with_failure (device_id, last_acknowledged_seq)
SELECT device_id, last_acknowledged_seq FROM register_predecessor;

DROP TABLE register_predecessor;

ALTER TABLE register_predecessor_with_failure RENAME TO register_predecessor;
