CREATE TABLE register_condition_starts (
  condition TEXT PRIMARY KEY,
  since TEXT NOT NULL
);

INSERT INTO register_condition_starts (condition, since)
SELECT
  CASE sales_stopped_reason
    WHEN 'installation_revoked' THEN 'installation_revoked'
    ELSE 'sales_denied:event_history_broken'
  END,
  installation_revoked_at
FROM sync_state
WHERE installation_revoked_at IS NOT NULL
  AND sales_stopped_reason IN ('installation_revoked', 'event_history_broken');
