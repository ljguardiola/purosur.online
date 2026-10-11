CREATE TABLE "lot_allocations" (
	"movement_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"quantity" bigint NOT NULL,
	CONSTRAINT "lot_allocations_movement_id_lot_id_pk" PRIMARY KEY("movement_id","lot_id"),
	CONSTRAINT "lot_allocations_quantity_check" CHECK ("lot_allocations"."quantity" <> 0)
);
--> statement-breakpoint
ALTER TABLE "lots" ALTER COLUMN "purchase_line_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ALTER COLUMN "cost_total_cents" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ALTER COLUMN "cost_quantity" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "purchased_on" date;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "technical" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "cost_incomplete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "remaining" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lot_allocations" ADD CONSTRAINT "lot_allocations_movement_id_stock_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_allocations" ADD CONSTRAINT "lot_allocations_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lot_allocations_lot_id_idx" ON "lot_allocations" USING btree ("lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lots_one_technical_per_product_branch" ON "lots" USING btree ("product_id","location_id") WHERE "lots"."technical";--> statement-breakpoint
CREATE INDEX "lots_product_id_location_id_idx" ON "lots" USING btree ("product_id","location_id");--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_technical_iff_no_purchase_line_check" CHECK ("lots"."technical" = ("lots"."purchase_line_id" is null));--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_cost_pair_check" CHECK (("lots"."cost_total_cents" is null) = ("lots"."cost_quantity" is null));--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_cost_known_or_incomplete_check" CHECK ("lots"."cost_total_cents" is not null or "lots"."cost_incomplete");--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_technical_has_no_expiry_or_purchase_date_check" CHECK (not "lots"."technical" or ("lots"."expires_on" is null and "lots"."purchased_on" is null));