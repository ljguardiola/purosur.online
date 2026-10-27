CREATE TABLE zone_rules (
  version TEXT PRIMARY KEY,
  transitions TEXT NOT NULL,
  publication_number INTEGER NOT NULL
);
