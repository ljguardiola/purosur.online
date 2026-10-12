ALTER TABLE sales
  ADD COLUMN sale_discount_kind TEXT
  CHECK (sale_discount_kind IN ('PERCENT', 'AMOUNT'));

ALTER TABLE sales
  ADD COLUMN sale_discount_value INTEGER
  CHECK (
    (sale_discount_value IS NULL) = (sale_discount_kind IS NULL)
    AND (
      sale_discount_kind IS NULL
      OR (sale_discount_kind = 'PERCENT' AND sale_discount_value BETWEEN 1 AND 100)
      OR (sale_discount_kind = 'AMOUNT' AND sale_discount_value > 0)
    )
  );

ALTER TABLE sales
  ADD COLUMN sale_discount_amount INTEGER
  CHECK (
    (sale_discount_amount IS NULL) = (sale_discount_kind IS NULL)
    AND (sale_discount_amount IS NULL OR sale_discount_amount >= 0)
  );

ALTER TABLE sales
  ADD COLUMN sale_discount_reason TEXT
  CHECK (
    (sale_discount_reason IS NULL) = (sale_discount_kind IS NULL)
    AND (sale_discount_reason IS NULL OR trim(sale_discount_reason) <> '')
  );

ALTER TABLE sales
  ADD COLUMN sale_discount_authorized_by TEXT
  CHECK (sale_discount_authorized_by IS NULL OR sale_discount_kind IS NOT NULL);

ALTER TABLE sale_lines
  ADD COLUMN sale_discount_share INTEGER NOT NULL DEFAULT 0
  CHECK (sale_discount_share >= 0);
