CREATE TABLE "purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"product_id" uuid NOT NULL,
	"packages" integer NOT NULL,
	"quantity_per_package" bigint NOT NULL,
	"expected_package_price_cents" bigint,
	CONSTRAINT "purchase_order_lines_order_product_key" UNIQUE("purchase_order_id","product_id"),
	CONSTRAINT "purchase_order_lines_order_position_key" UNIQUE("purchase_order_id","position"),
	CONSTRAINT "purchase_order_lines_position_check" CHECK ("purchase_order_lines"."position" > 0),
	CONSTRAINT "purchase_order_lines_packages_check" CHECK ("purchase_order_lines"."packages" > 0),
	CONSTRAINT "purchase_order_lines_quantity_per_package_check" CHECK ("purchase_order_lines"."quantity_per_package" > 0),
	CONSTRAINT "purchase_order_lines_expected_package_price_check" CHECK ("purchase_order_lines"."expected_package_price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	CONSTRAINT "purchase_orders_state_check" CHECK ("purchase_orders"."state" in ('DRAFT', 'CANCELLED')),
	CONSTRAINT "purchase_orders_cancellation_check" CHECK (("purchase_orders"."state" = 'CANCELLED') = ("purchase_orders"."cancelled_at" is not null and "purchase_orders"."cancelled_by" is not null) and ("purchase_orders"."cancelled_at" is null) = ("purchase_orders"."cancelled_by" is null))
);
--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_orders_location_id_state_created_at_idx" ON "purchase_orders" USING btree ("location_id","state","created_at");