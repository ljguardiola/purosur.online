ALTER TABLE "lots" DROP CONSTRAINT "lots_withdrawn_only_if_initial_count_check";--> statement-breakpoint
DROP INDEX "lots_one_own_lot_per_purchase_line";--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "lots_one_own_lot_per_purchase_line" ON "lots" USING btree ("purchase_line_id") WHERE "lots"."split_from_lot_id" is null and not "lots"."withdrawn";--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_withdrawn_only_if_purchased_or_initial_count_check" CHECK (not "lots"."withdrawn" or "lots"."origin_movement_id" is not null or "lots"."purchase_line_id" is not null);