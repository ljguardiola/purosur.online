ALTER TABLE payment_transactions ADD COLUMN replaced INTEGER NOT NULL DEFAULT 0
  CHECK (replaced IN (0, 1) AND (replaced = 0 OR method = 'QR'));
