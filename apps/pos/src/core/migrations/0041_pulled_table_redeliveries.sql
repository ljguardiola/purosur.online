CREATE TABLE pulled_table_redeliveries (
  table_name TEXT PRIMARY KEY,
  cursor INTEGER NOT NULL DEFAULT 0 CHECK (cursor >= 0)
);

INSERT INTO pulled_table_redeliveries (table_name) VALUES ('register_point_of_sale');
