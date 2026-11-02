ALTER TABLE "stock_movements" ADD COLUMN "return_id" uuid;--> statement-breakpoint
UPDATE "stock_movements" SET "return_id" = "returns"."id"
FROM "return_lines"
INNER JOIN "returns" ON "returns"."id" = "return_lines"."return_id"
WHERE "return_lines"."sale_line_id" = "stock_movements"."sale_line_id"
  AND "returns"."occurred_at" = "stock_movements"."occurred_at"
  AND ("stock_movements"."kind" in ('return', 'exchange_out') OR ("stock_movements"."kind" = 'loss' AND "stock_movements"."reason" = 'return_discard'));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_return_id_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."returns"("id") ON DELETE no action ON UPDATE no action;
