ALTER TABLE register_point_of_sale
  ADD COLUMN awaiting_restored_numbering INTEGER NOT NULL DEFAULT 0
    CHECK (awaiting_restored_numbering IN (0, 1));
