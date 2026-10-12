CREATE TABLE "stock_count_lots" (
	"movement_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"counted" bigint NOT NULL,
	CONSTRAINT "stock_count_lots_movement_id_lot_id_pk" PRIMARY KEY("movement_id","lot_id"),
	CONSTRAINT "stock_count_lots_counted_non_negative" CHECK ("stock_count_lots"."counted" >= 0)
);
--> statement-breakpoint
ALTER TABLE "stock_count_lots" ADD CONSTRAINT "stock_count_lots_movement_id_stock_counts_movement_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."stock_counts"("movement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lots" ADD CONSTRAINT "stock_count_lots_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_count_lots_lot_id_idx" ON "stock_count_lots" USING btree ("lot_id");--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "stock_count_lots" FROM cloud_app;
