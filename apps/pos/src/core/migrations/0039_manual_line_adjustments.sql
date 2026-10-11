ALTER TABLE sale_lines
  ADD COLUMN manual_adjustment_kind TEXT
  CHECK (manual_adjustment_kind IN ('PRICE', 'PERCENT', 'AMOUNT'));

ALTER TABLE sale_lines
  ADD COLUMN manual_adjustment_value INTEGER
  CHECK (
    (manual_adjustment_value IS NULL) = (manual_adjustment_kind IS NULL)
    AND (
      manual_adjustment_kind IS NULL
      OR (manual_adjustment_kind = 'PRICE' AND manual_adjustment_value >= 0)
      OR (manual_adjustment_kind = 'PERCENT' AND manual_adjustment_value BETWEEN 1 AND 100)
      OR (manual_adjustment_kind = 'AMOUNT' AND manual_adjustment_value > 0)
    )
  );

ALTER TABLE sale_lines
  ADD COLUMN manual_adjustment_reason TEXT
  CHECK (
    (manual_adjustment_reason IS NULL) = (manual_adjustment_kind IS NULL)
    AND (manual_adjustment_reason IS NULL OR trim(manual_adjustment_reason) <> '')
  );

ALTER TABLE sale_lines
  ADD COLUMN manual_adjustment_authorized_by TEXT
  CHECK (manual_adjustment_authorized_by IS NULL OR manual_adjustment_kind IS NOT NULL);
