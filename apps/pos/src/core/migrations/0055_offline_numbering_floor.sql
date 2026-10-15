ALTER TABLE register_offline_point_of_sale
  ADD COLUMN highest_synced_offline_number INTEGER
  CHECK (highest_synced_offline_number IS NULL OR highest_synced_offline_number >= 0);

CREATE TABLE offline_number_blocks_rebuilt (
  id TEXT PRIMARY KEY,
  point_of_sale INTEGER NOT NULL CHECK (point_of_sale BETWEEN 1 AND 99999),
  document_type TEXT NOT NULL CHECK (document_type IN ('factura_c')),
  first_number INTEGER NOT NULL,
  last_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_use', 'used_up')),
  version INTEGER NOT NULL,
  UNIQUE (point_of_sale, document_type, first_number),
  CHECK (first_number >= 1 AND last_number >= first_number)
);

INSERT INTO offline_number_blocks_rebuilt (id, point_of_sale, document_type, first_number, last_number, status, version)
SELECT id, point_of_sale, document_type, first_number, last_number, status, version FROM offline_number_blocks;

DROP TABLE offline_number_blocks;

ALTER TABLE offline_number_blocks_rebuilt RENAME TO offline_number_blocks;

INSERT INTO pulled_table_redeliveries (table_name) VALUES ('register_offline_point_of_sale')
  ON CONFLICT (table_name) DO UPDATE SET cursor = 0;
