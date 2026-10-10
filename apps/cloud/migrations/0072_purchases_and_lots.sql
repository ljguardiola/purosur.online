CREATE TABLE "lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"purchase_line_id" uuid NOT NULL,
	"lot_number" text,
	"expires_on" date,
	"cost_total_cents" bigint NOT NULL,
	"cost_quantity" bigint NOT NULL,
	"quantity_received" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lots_purchase_line_id_key" UNIQUE("purchase_line_id"),
	CONSTRAINT "lots_cost_quantity_check" CHECK ("lots"."cost_quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"product_id" uuid NOT NULL,
	"packaging_id" uuid,
	"packages" integer,
	"quantity" bigint NOT NULL,
	"cost_paid_cents" bigint NOT NULL,
	"quantity_per_package" bigint NOT NULL,
	"lot_number" text,
	"expires_on" date,
	CONSTRAINT "purchase_lines_purchase_id_position_key" UNIQUE("purchase_id","position"),
	CONSTRAINT "purchase_lines_quantity_per_package_check" CHECK ("purchase_lines"."quantity_per_package" > 0),
	CONSTRAINT "purchase_lines_position_check" CHECK ("purchase_lines"."position" > 0),
	CONSTRAINT "purchase_lines_quantity_check" CHECK ("purchase_lines"."quantity" > 0),
	CONSTRAINT "purchase_lines_cost_paid_check" CHECK ("purchase_lines"."cost_paid_cents" >= 0),
	CONSTRAINT "purchase_lines_packaging_iff_packages_check" CHECK (("purchase_lines"."packaging_id" is null) = ("purchase_lines"."packages" is null)),
	CONSTRAINT "purchase_lines_packages_quantity_check" CHECK ("purchase_lines"."packages" is null or ("purchase_lines"."packages" > 0 and "purchase_lines"."quantity" = "purchase_lines"."packages" * "purchase_lines"."quantity_per_package"))
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"purchased_on" date NOT NULL,
	"receipt_type" text NOT NULL,
	"receipt_number" text,
	"note" text,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	CONSTRAINT "purchases_receipt_type_check" CHECK ("purchases"."receipt_type" in ('factura_b', 'factura_c', 'remito', 'ticket', 'otro', 'sin_comprobante')),
	CONSTRAINT "purchases_receipt_number_iff_receipt_check" CHECK (("purchases"."receipt_type" = 'sin_comprobante') = ("purchases"."receipt_number" is null))
);
--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_reason_unless_count_or_sale_check";--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_kind_check";--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "purchase_line_id" uuid;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_purchase_line_id_purchase_lines_id_fk" FOREIGN KEY ("purchase_line_id") REFERENCES "public"."purchase_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_packaging_id_product_packagings_id_fk" FOREIGN KEY ("packaging_id") REFERENCES "public"."product_packagings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_lines_purchase_id_idx" ON "purchase_lines" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "purchases_location_id_recorded_at_idx" ON "purchases" USING btree ("location_id","recorded_at");--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_line_id_purchase_lines_id_fk" FOREIGN KEY ("purchase_line_id") REFERENCES "public"."purchase_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reason_unless_count_sale_or_receipt_check" CHECK (("stock_movements"."kind" in ('count', 'sale', 'receipt')) = ("stock_movements"."reason" is null));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_line_iff_receipt_check" CHECK (("stock_movements"."kind" = 'receipt') = ("stock_movements"."purchase_line_id" is not null));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_kind_check" CHECK ("stock_movements"."kind" in ('loss', 'adjustment', 'count', 'sale', 'receipt'));