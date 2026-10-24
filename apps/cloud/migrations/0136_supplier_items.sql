CREATE TABLE "supplier_item_prices" (
	"item_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"price_cents" bigint NOT NULL,
	"list_date" date NOT NULL,
	"prices_include_vat" boolean NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "supplier_item_prices_pkey" PRIMARY KEY("item_id","list_id"),
	CONSTRAINT "supplier_item_prices_price_check" CHECK ("supplier_item_prices"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "supplier_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"key_kind" text NOT NULL,
	"key_value" text NOT NULL,
	"description" text NOT NULL,
	"product_id" uuid,
	"packaging_id" uuid,
	"vat_rate" integer,
	CONSTRAINT "supplier_items_supplier_key_key" UNIQUE("supplier_id","key_kind","key_value"),
	CONSTRAINT "supplier_items_key_kind_check" CHECK ("supplier_items"."key_kind" in ('code', 'description')),
	CONSTRAINT "supplier_items_link_check" CHECK (("supplier_items"."product_id" is null) = ("supplier_items"."packaging_id" is null)),
	CONSTRAINT "supplier_items_vat_rate_check" CHECK ("supplier_items"."vat_rate" in (2100, 1050))
);
--> statement-breakpoint
ALTER TABLE "supplier_price_list_rows" ADD COLUMN "barcode" text;--> statement-breakpoint
ALTER TABLE "supplier_price_list_rows" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier_price_list_rows" ADD COLUMN "packaging_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier_price_list_rows" ADD COLUMN "vat_rate" integer;--> statement-breakpoint
ALTER TABLE "supplier_price_list_rows" ADD COLUMN "reviewed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_item_prices" ADD CONSTRAINT "supplier_item_prices_item_id_supplier_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."supplier_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_item_prices" ADD CONSTRAINT "supplier_item_prices_list_id_supplier_price_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."supplier_price_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_items" ADD CONSTRAINT "supplier_items_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_items" ADD CONSTRAINT "supplier_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_items" ADD CONSTRAINT "supplier_items_packaging_id_product_packagings_id_fk" FOREIGN KEY ("packaging_id") REFERENCES "public"."product_packagings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_items_product_id_idx" ON "supplier_items" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "supplier_price_list_rows" ADD CONSTRAINT "supplier_price_list_rows_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_price_list_rows" ADD CONSTRAINT "supplier_price_list_rows_packaging_id_product_packagings_id_fk" FOREIGN KEY ("packaging_id") REFERENCES "public"."product_packagings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_price_list_rows" ADD CONSTRAINT "supplier_price_list_rows_link_check" CHECK (("supplier_price_list_rows"."product_id" is null) = ("supplier_price_list_rows"."packaging_id" is null));--> statement-breakpoint
ALTER TABLE "supplier_price_list_rows" ADD CONSTRAINT "supplier_price_list_rows_vat_rate_check" CHECK ("supplier_price_list_rows"."vat_rate" in (2100, 1050));