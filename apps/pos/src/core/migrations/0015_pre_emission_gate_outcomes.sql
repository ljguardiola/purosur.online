CREATE TABLE pre_emission_gate_outcomes (
  sale_id TEXT PRIMARY KEY REFERENCES sales (id),
  evaluated_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('PASSED', 'FAILED')),
  failure_reason TEXT,
  document TEXT,
  CHECK (
    (outcome = 'PASSED' AND document IS NOT NULL AND failure_reason IS NULL)
    OR (outcome = 'FAILED' AND document IS NULL AND failure_reason IS NOT NULL)
  )
);
