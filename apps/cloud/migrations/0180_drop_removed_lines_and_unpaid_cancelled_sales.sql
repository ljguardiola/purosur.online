CREATE TEMPORARY TABLE "unpaid_cancelled_sales" AS
SELECT "sale"."id"
FROM "sales" "sale"
WHERE "sale"."state" = 'CANCELLED'
  AND NOT EXISTS (
    SELECT 1 FROM "sale_payments" "payment"
    WHERE "payment"."sale_id" = "sale"."id" AND "payment"."state" = 'APPROVED'
  )
  AND NOT EXISTS (SELECT 1 FROM "returns" "sale_return" WHERE "sale_return"."sale_id" = "sale"."id")
  AND NOT EXISTS (SELECT 1 FROM "deferred_sales" "deferred" WHERE "deferred"."sale_id" = "sale"."id")
  AND NOT EXISTS (SELECT 1 FROM "offline_fiscal_documents" "document" WHERE "document"."sale_id" = "sale"."id")
  AND NOT EXISTS (SELECT 1 FROM "fiscal_requests" "request" WHERE "request"."sale_id" = "sale"."id")
  AND NOT EXISTS (SELECT 1 FROM "credit_notes" "credit_note" WHERE "credit_note"."sale_id" = "sale"."id")
  AND NOT EXISTS (
    SELECT 1
    FROM "sale_lines" "line"
    WHERE "line"."sale_id" = "sale"."id"
      AND (
        EXISTS (SELECT 1 FROM "stock_movements" "movement" WHERE "movement"."sale_line_id" = "line"."id")
        OR EXISTS (SELECT 1 FROM "return_lines" "returned" WHERE "returned"."sale_line_id" = "line"."id")
      )
  );--> statement-breakpoint
DELETE FROM "payment_refunds" WHERE "sale_id" IN (SELECT "id" FROM "unpaid_cancelled_sales");--> statement-breakpoint
DELETE FROM "sale_reprints" WHERE "sale_id" IN (SELECT "id" FROM "unpaid_cancelled_sales");--> statement-breakpoint
DELETE FROM "sale_payments" WHERE "sale_id" IN (SELECT "id" FROM "unpaid_cancelled_sales");--> statement-breakpoint
DELETE FROM "sale_lines" WHERE "sale_id" IN (SELECT "id" FROM "unpaid_cancelled_sales");--> statement-breakpoint
DELETE FROM "sales" WHERE "id" IN (SELECT "id" FROM "unpaid_cancelled_sales");--> statement-breakpoint
DROP TABLE "unpaid_cancelled_sales";--> statement-breakpoint
DROP TABLE "removed_sale_lines" CASCADE;
