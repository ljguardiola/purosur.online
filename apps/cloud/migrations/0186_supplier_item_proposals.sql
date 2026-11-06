CREATE TABLE "supplier_item_link_proposals" (
	"row_id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"product_id" uuid,
	"proposed_by" text,
	"quantity" bigint,
	CONSTRAINT "supplier_item_link_proposals_kind_check" CHECK ("supplier_item_link_proposals"."kind" in ('PROPOSED', 'NONE')),
	CONSTRAINT "supplier_item_link_proposals_proposed_by_check" CHECK ("supplier_item_link_proposals"."proposed_by" in ('BARCODE', 'AI')),
	CONSTRAINT "supplier_item_link_proposals_product_check" CHECK (("supplier_item_link_proposals"."kind" = 'PROPOSED') = ("supplier_item_link_proposals"."product_id" is not null)),
	CONSTRAINT "supplier_item_link_proposals_proposed_by_kind_check" CHECK (("supplier_item_link_proposals"."kind" = 'PROPOSED') = ("supplier_item_link_proposals"."proposed_by" is not null)),
	CONSTRAINT "supplier_item_link_proposals_quantity_check" CHECK ("supplier_item_link_proposals"."quantity" is null or ("supplier_item_link_proposals"."quantity" > 0 and "supplier_item_link_proposals"."kind" = 'PROPOSED'))
);
--> statement-breakpoint
CREATE TABLE "supplier_item_quantity_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"row_id" uuid NOT NULL,
	"sale_unit" text NOT NULL,
	"net_content_quantity" numeric(10, 3),
	"net_content_unit" text,
	"kind" text NOT NULL,
	"quantity" bigint,
	CONSTRAINT "supplier_item_quantity_proposals_shape_key" UNIQUE NULLS NOT DISTINCT("row_id","sale_unit","net_content_quantity","net_content_unit"),
	CONSTRAINT "supplier_item_quantity_proposals_sale_unit_check" CHECK ("supplier_item_quantity_proposals"."sale_unit" in ('UNIT', 'KG')),
	CONSTRAINT "supplier_item_quantity_proposals_net_content_unit_check" CHECK ("supplier_item_quantity_proposals"."net_content_unit" in ('G', 'KG', 'ML', 'L', 'UNIT')),
	CONSTRAINT "supplier_item_quantity_proposals_net_content_both_or_neither_check" CHECK (("supplier_item_quantity_proposals"."net_content_quantity" is null) = ("supplier_item_quantity_proposals"."net_content_unit" is null)),
	CONSTRAINT "supplier_item_quantity_proposals_net_content_quantity_check" CHECK ("supplier_item_quantity_proposals"."net_content_quantity" > 0),
	CONSTRAINT "supplier_item_quantity_proposals_kind_check" CHECK ("supplier_item_quantity_proposals"."kind" in ('PROPOSED', 'NONE')),
	CONSTRAINT "supplier_item_quantity_proposals_quantity_check" CHECK (("supplier_item_quantity_proposals"."kind" = 'PROPOSED') = ("supplier_item_quantity_proposals"."quantity" is not null) and ("supplier_item_quantity_proposals"."quantity" is null or "supplier_item_quantity_proposals"."quantity" > 0))
);
--> statement-breakpoint
ALTER TABLE "supplier_item_link_proposals" ADD CONSTRAINT "supplier_item_link_proposals_row_id_supplier_price_list_rows_id_fk" FOREIGN KEY ("row_id") REFERENCES "public"."supplier_price_list_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_item_link_proposals" ADD CONSTRAINT "supplier_item_link_proposals_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_item_quantity_proposals" ADD CONSTRAINT "supplier_item_quantity_proposals_row_id_supplier_price_list_rows_id_fk" FOREIGN KEY ("row_id") REFERENCES "public"."supplier_price_list_rows"("id") ON DELETE cascade ON UPDATE no action;