CREATE TABLE issuer_identification_versions (
  version INTEGER PRIMARY KEY,
  legal_name TEXT,
  gross_income_registration TEXT,
  activity_start_date TEXT,
  authorized_cuit TEXT NOT NULL,
  tax_status TEXT NOT NULL
);

CREATE TABLE buyer_identification_thresholds (
  id TEXT PRIMARY KEY,
  amount INTEGER NOT NULL CHECK (amount > 0),
  valid_from TEXT NOT NULL
);

CREATE TABLE buyer_tax_status_sets (
  params_version INTEGER PRIMARY KEY,
  set_id TEXT NOT NULL,
  options TEXT NOT NULL
);
