UPDATE sales
SET state = 'CANCELLED', occurred_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE state = 'OPEN'
  AND NOT EXISTS (SELECT 1 FROM sale_lines WHERE sale_lines.sale_id = sales.id)
  AND EXISTS (SELECT 1 FROM payment_transactions WHERE payment_transactions.sale_id = sales.id);

DELETE FROM sales_rebuilt_against_paid_orders
WHERE sale_id IN (
  SELECT id FROM sales
  WHERE state = 'OPEN'
    AND NOT EXISTS (SELECT 1 FROM sale_lines WHERE sale_lines.sale_id = sales.id)
);

DELETE FROM sales
WHERE state = 'OPEN'
  AND NOT EXISTS (SELECT 1 FROM sale_lines WHERE sale_lines.sale_id = sales.id);
