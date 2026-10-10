PRAGMA defer_foreign_keys = ON;

CREATE TABLE sale_lines_held AS
  SELECT id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id,
         line_total, promotion_id, discount_amount, sale_unit
  FROM sale_lines;

DROP TABLE sale_lines;

CREATE TABLE sale_lines (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales (id),
  position INTEGER NOT NULL CHECK (position > 0),
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  list_unit_price INTEGER NOT NULL CHECK (list_unit_price >= 0),
  price_list_id TEXT NOT NULL,
  line_total INTEGER NOT NULL CHECK (line_total >= 0),
  promotion_id TEXT,
  discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  sale_unit TEXT NOT NULL DEFAULT 'UNIT' CHECK (sale_unit IN ('UNIT', 'KG')),
  weight_source TEXT CHECK (weight_source IN ('SCALE', 'MANUAL')),
  UNIQUE (sale_id, position),
  CHECK ((weight_source IS NOT NULL) = (sale_unit = 'KG'))
);

INSERT INTO sale_lines (
  id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id,
  line_total, promotion_id, discount_amount, sale_unit, weight_source
)
  SELECT id, sale_id, position, product_id, product_name, quantity, list_unit_price, price_list_id,
         line_total, promotion_id, discount_amount, sale_unit,
         CASE WHEN sale_unit = 'KG' THEN 'MANUAL' END
  FROM sale_lines_held;

DROP TABLE sale_lines_held;

CREATE INDEX sale_lines_by_product ON sale_lines (product_id);
