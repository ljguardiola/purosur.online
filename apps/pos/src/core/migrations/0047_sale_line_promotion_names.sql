CREATE TABLE sale_line_promotions_held AS
  SELECT line_id, discount_id, kind, percent, buy_qty, pay_qty,
         (SELECT discounts.name FROM discounts WHERE discounts.id = sale_line_promotions.discount_id) AS name
  FROM sale_line_promotions;

DROP TABLE sale_line_promotions;

CREATE TABLE sale_line_promotions (
  line_id TEXT NOT NULL REFERENCES sale_lines (id),
  discount_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('PERCENT_OFF', 'BUY_N_PAY_M')),
  percent INTEGER,
  buy_qty INTEGER,
  pay_qty INTEGER,
  PRIMARY KEY (line_id, discount_id),
  CHECK (
    (kind = 'PERCENT_OFF'
      AND percent IS NOT NULL AND percent BETWEEN 1 AND 99
      AND buy_qty IS NULL AND pay_qty IS NULL)
    OR
    (kind = 'BUY_N_PAY_M'
      AND percent IS NULL
      AND buy_qty IS NOT NULL AND pay_qty IS NOT NULL
      AND pay_qty >= 1 AND buy_qty > pay_qty)
  )
);

INSERT INTO sale_line_promotions (line_id, discount_id, name, kind, percent, buy_qty, pay_qty)
  SELECT line_id, discount_id, name, kind, percent, buy_qty, pay_qty
  FROM sale_line_promotions_held;

DROP TABLE sale_line_promotions_held;
