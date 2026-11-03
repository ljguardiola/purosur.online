DELETE FROM sales
WHERE state = 'OPEN'
  AND NOT EXISTS (SELECT 1 FROM sale_lines WHERE sale_lines.sale_id = sales.id)
  AND NOT EXISTS (SELECT 1 FROM payment_transactions WHERE payment_transactions.sale_id = sales.id)
  AND NOT EXISTS (
    SELECT 1 FROM sales_rebuilt_against_paid_orders
    WHERE sales_rebuilt_against_paid_orders.sale_id = sales.id
  );
