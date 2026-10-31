ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_sale_line_iff_sale_check";--> statement-breakpoint
UPDATE "stock_movements" SET "sale_line_id" = ("returned"."movement"->>'sale_line_id')::uuid
FROM "inbox", jsonb_array_elements("inbox"."payload"->'stock_movements') AS "returned"("movement")
WHERE "stock_movements"."kind" = 'loss'
  AND "stock_movements"."reason" = 'return_discard'
  AND "inbox"."event_type" = 'sale_returned'
  AND "inbox"."applied_at" IS NOT NULL
  AND "returned"."movement"->>'id' = "stock_movements"."id"::text;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_line_iff_sale_check" CHECK (("stock_movements"."kind" in ('sale', 'sale_void', 'return') or ("stock_movements"."kind" = 'loss' and "stock_movements"."reason" = 'return_discard')) = ("stock_movements"."sale_line_id" is not null));
