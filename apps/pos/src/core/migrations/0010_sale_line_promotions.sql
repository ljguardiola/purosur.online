ALTER TABLE sale_lines ADD COLUMN promotion_id TEXT;
ALTER TABLE sale_lines ADD COLUMN discount_amount INTEGER NOT NULL DEFAULT 0
  CHECK (discount_amount >= 0);

CREATE TABLE sale_line_promotions (
  line_id TEXT NOT NULL REFERENCES sale_lines (id),
  discount_id TEXT NOT NULL,
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
