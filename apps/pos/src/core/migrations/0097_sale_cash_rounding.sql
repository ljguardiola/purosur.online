ALTER TABLE sales
  ADD COLUMN cash_rounding INTEGER NOT NULL DEFAULT 0
  CHECK (cash_rounding >= 0 AND cash_rounding < 10000);
