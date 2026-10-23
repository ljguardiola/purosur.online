ALTER TABLE register_predecessor
  ADD COLUMN from_copy INTEGER NOT NULL DEFAULT 1 CHECK (from_copy IN (0, 1));
