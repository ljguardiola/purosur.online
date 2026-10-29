INSERT INTO pulled_table_redeliveries (table_name) VALUES ('brands')
  ON CONFLICT (table_name) DO UPDATE SET cursor = 0;
INSERT INTO pulled_table_redeliveries (table_name) VALUES ('zone_rules')
  ON CONFLICT (table_name) DO UPDATE SET cursor = 0;
INSERT INTO pulled_table_redeliveries (table_name) VALUES ('stock_movements')
  ON CONFLICT (table_name) DO UPDATE SET cursor = 0;
