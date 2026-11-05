CREATE TABLE "lot_cost_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	"previous_cost_total_cents" bigint NOT NULL,
	"previous_cost_quantity" bigint NOT NULL,
	CONSTRAINT "lot_cost_changes_previous_cost_quantity_check" CHECK ("lot_cost_changes"."previous_cost_quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "lot_cost_changes" ADD CONSTRAINT "lot_cost_changes_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lot_cost_changes_lot_id_idx" ON "lot_cost_changes" USING btree ("lot_id");--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "lot_cost_changes" FROM cloud_app;
