ALTER TABLE awaiting_orphan_sweep
  ADD COLUMN from_copy INTEGER NOT NULL DEFAULT 1 CHECK (from_copy IN (0, 1));
