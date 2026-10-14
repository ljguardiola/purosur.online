CREATE TABLE "assembly_batch_lines" (
	"batch_id" uuid NOT NULL,
	"component_product_id" uuid NOT NULL,
	"quantity" bigint NOT NULL,
	CONSTRAINT "assembly_batch_lines_pkey" PRIMARY KEY("batch_id","component_product_id"),
	CONSTRAINT "assembly_batch_lines_quantity_check" CHECK ("assembly_batch_lines"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "assembly_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"assembled_at" timestamp with time zone NOT NULL,
	"output_qty" bigint NOT NULL,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assembly_batches_output_qty_check" CHECK ("assembly_batches"."output_qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "lots" DROP CONSTRAINT "lots_exactly_one_origin_check";--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_kind_check";--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_reason_unless_count_sale_or_receipt_check";--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "assembly_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "assembly_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "assembly_batch_lines" ADD CONSTRAINT "assembly_batch_lines_batch_id_assembly_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."assembly_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_batch_lines" ADD CONSTRAINT "assembly_batch_lines_component_product_id_products_id_fk" FOREIGN KEY ("component_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_batches" ADD CONSTRAINT "assembly_batches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_batches" ADD CONSTRAINT "assembly_batches_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_batches" ADD CONSTRAINT "assembly_batches_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assembly_batches_location_id_assembled_at_idx" ON "assembly_batches" USING btree ("location_id","assembled_at");--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_assembly_batch_id_assembly_batches_id_fk" FOREIGN KEY ("assembly_batch_id") REFERENCES "public"."assembly_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_assembly_batch_id_assembly_batches_id_fk" FOREIGN KEY ("assembly_batch_id") REFERENCES "public"."assembly_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_assembly_batch_id_key" UNIQUE("assembly_batch_id");--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_exactly_one_origin_check" CHECK ("lots"."technical"::int + ("lots"."purchase_line_id" is not null)::int + ("lots"."origin_movement_id" is not null)::int + ("lots"."assembly_batch_id" is not null)::int = 1);--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_assembly_batch_iff_assembly_check" CHECK (("stock_movements"."kind" in ('assembly_out', 'assembly_in')) = ("stock_movements"."assembly_batch_id" is not null));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_kind_check" CHECK ("stock_movements"."kind" in ('loss', 'adjustment', 'count', 'sale', 'receipt', 'opening_count', 'opening_count_withdrawal', 'assembly_out', 'assembly_in'));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reason_unless_count_sale_or_receipt_check" CHECK (("stock_movements"."kind" in ('count', 'sale', 'receipt', 'opening_count', 'opening_count_withdrawal', 'assembly_out', 'assembly_in')) = ("stock_movements"."reason" is null));