CREATE TABLE offline_authorization_codes (
  fortnight_start TEXT PRIMARY KEY,
  fortnight_end TEXT NOT NULL,
  code TEXT NOT NULL,
  report_deadline TEXT NOT NULL,
  version INTEGER NOT NULL
);

CREATE TABLE offline_number_blocks (
  id TEXT PRIMARY KEY,
  point_of_sale INTEGER NOT NULL CHECK (point_of_sale BETWEEN 1 AND 99999),
  document_type TEXT NOT NULL CHECK (document_type IN ('factura_c')),
  first_number INTEGER NOT NULL,
  last_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_use')),
  version INTEGER NOT NULL,
  UNIQUE (point_of_sale, document_type, first_number),
  CHECK (first_number >= 1 AND last_number >= first_number)
);
