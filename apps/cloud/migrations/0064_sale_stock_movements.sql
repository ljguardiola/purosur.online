ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_reason_unless_count_check";--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_kind_check";--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "sale_line_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_line_id_sale_lines_id_fk" FOREIGN KEY ("sale_line_id") REFERENCES "public"."sale_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reason_unless_count_or_sale_check" CHECK (("stock_movements"."kind" in ('count', 'sale')) = ("stock_movements"."reason" is null));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_line_iff_sale_check" CHECK (("stock_movements"."kind" = 'sale') = ("stock_movements"."sale_line_id" is not null));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_kind_check" CHECK ("stock_movements"."kind" in ('loss', 'adjustment', 'count', 'sale'));