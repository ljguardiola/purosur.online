CREATE TABLE "product_barcodes" (
	"product_id" uuid NOT NULL,
	"code" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "product_barcodes_product_id_position_pk" PRIMARY KEY("product_id","position")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid NOT NULL,
	"sale_unit" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "products_sale_unit_check" CHECK ("products"."sale_unit" in ('UNIT', 'KG'))
);
--> statement-breakpoint
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_barcodes_code_key" ON "product_barcodes" USING btree ("code");