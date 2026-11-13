ALTER TABLE payment_transactions ADD COLUMN approval_order INTEGER;

UPDATE payment_transactions SET approval_order = rowid WHERE state = 'APPROVED';

CREATE UNIQUE INDEX payment_transactions_by_approval_order ON payment_transactions (approval_order);
