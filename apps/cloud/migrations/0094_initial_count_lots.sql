CREATE TABLE "branch_first_cash_sessions" (
	"location_id" uuid PRIMARY KEY NOT NULL,
	"opened_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lots" DROP CONSTRAINT "lots_technical_iff_no_purchase_line_check";--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_kind_check";--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_reason_unless_count_sale_or_receipt_check";--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "origin_movement_id" uuid;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "withdrawn" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "branch_first_cash_sessions" ADD CONSTRAINT "branch_first_cash_sessions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_origin_movement_id_stock_movements_id_fk" FOREIGN KEY ("origin_movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_origin_movement_id_key" UNIQUE("origin_movement_id");--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_exactly_one_origin_check" CHECK ("lots"."technical"::int + ("lots"."purchase_line_id" is not null)::int + ("lots"."origin_movement_id" is not null)::int = 1);--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_withdrawn_only_if_initial_count_check" CHECK (not "lots"."withdrawn" or "lots"."origin_movement_id" is not null);--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_kind_check" CHECK ("stock_movements"."kind" in ('loss', 'adjustment', 'count', 'sale', 'receipt', 'opening_count', 'opening_count_withdrawal'));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reason_unless_count_sale_or_receipt_check" CHECK (("stock_movements"."kind" in ('count', 'sale', 'receipt', 'opening_count', 'opening_count_withdrawal')) = ("stock_movements"."reason" is null));--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "branch_first_cash_sessions" FROM cloud_app;--> statement-breakpoint
INSERT INTO "branch_first_cash_sessions" ("location_id", "opened_at")
SELECT "location_id", min("opened_at") FROM "cash_sessions" GROUP BY "location_id";--> statement-breakpoint
INSERT INTO "changes" ("entity", "entity_id", "version", "op")
SELECT 'branch_first_cash_session', "location_id", 1, 'insert' FROM "branch_first_cash_sessions";
