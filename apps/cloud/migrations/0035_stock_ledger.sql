CREATE TABLE "stock_balances" (
	"product_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "stock_balances_product_id_location_id_pk" PRIMARY KEY("product_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"movement_id" uuid PRIMARY KEY NOT NULL,
	"counted" bigint NOT NULL,
	"expected" bigint NOT NULL,
	CONSTRAINT "stock_counts_counted_non_negative" CHECK ("stock_counts"."counted" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"reason" text,
	"delta" bigint NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid NOT NULL,
	"superseded_by_count_id" uuid,
	CONSTRAINT "stock_movements_kind_check" CHECK ("stock_movements"."kind" in ('loss', 'adjustment', 'count')),
	CONSTRAINT "stock_movements_reason_unless_count_check" CHECK (("stock_movements"."kind" = 'count') = ("stock_movements"."reason" is null))
);
--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_movement_id_stock_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_superseded_by_count_id_stock_movements_id_fk" FOREIGN KEY ("superseded_by_count_id") REFERENCES "public"."stock_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_product_id_location_id_occurred_at_idx" ON "stock_movements" USING btree ("product_id","location_id","occurred_at");--> statement-breakpoint
CREATE INDEX "stock_movements_location_id_occurred_at_idx" ON "stock_movements" USING btree ("location_id","occurred_at");
--> statement-breakpoint
-- Append-only, the same way migration 0030 makes prices append-only: a stock movement or a count is
-- the history the balance is built from, so the database itself refuses to rewrite or erase one.
REVOKE UPDATE, DELETE, TRUNCATE ON "stock_movements" FROM cloud_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "stock_counts" FROM cloud_app;
