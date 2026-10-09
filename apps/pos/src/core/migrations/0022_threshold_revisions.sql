ALTER TABLE buyer_identification_thresholds
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0);
