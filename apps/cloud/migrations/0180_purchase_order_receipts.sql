CREATE TABLE "purchase_order_receipt_lines" (
	"purchase_order_receipt_id" uuid NOT NULL,
	"purchase_order_line_id" uuid NOT NULL,
	"received_quantity" bigint NOT NULL,
	"missing_quantity" bigint NOT NULL,
	"price_difference_cents" bigint,
	CONSTRAINT "purchase_order_receipt_lines_pkey" PRIMARY KEY("purchase_order_receipt_id","purchase_order_line_id"),
	CONSTRAINT "purchase_order_receipt_lines_received_quantity_check" CHECK ("purchase_order_receipt_lines"."received_quantity" >= 0),
	CONSTRAINT "purchase_order_receipt_lines_missing_quantity_check" CHECK ("purchase_order_receipt_lines"."missing_quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_order_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	CONSTRAINT "purchase_order_receipts_purchase_id_key" UNIQUE("purchase_id")
);
--> statement-breakpoint
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_state_check";--> statement-breakpoint
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_sending_check";--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_order_receipt_lines" ADD CONSTRAINT "purchase_order_receipt_lines_purchase_order_receipt_id_purchase_order_receipts_id_fk" FOREIGN KEY ("purchase_order_receipt_id") REFERENCES "public"."purchase_order_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_receipt_lines" ADD CONSTRAINT "purchase_order_receipt_lines_purchase_order_line_id_purchase_order_lines_id_fk" FOREIGN KEY ("purchase_order_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_receipts" ADD CONSTRAINT "purchase_order_receipts_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_receipts" ADD CONSTRAINT "purchase_order_receipts_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_receipts" ADD CONSTRAINT "purchase_order_receipts_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_order_receipt_lines_purchase_order_line_id_idx" ON "purchase_order_receipt_lines" USING btree ("purchase_order_line_id");--> statement-breakpoint
CREATE INDEX "purchase_order_receipts_purchase_order_id_idx" ON "purchase_order_receipts" USING btree ("purchase_order_id");--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_receiving_check" CHECK (("purchase_orders"."state" = 'RECEIVED') = ("purchase_orders"."received_at" is not null));--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_state_check" CHECK ("purchase_orders"."state" in ('DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'));--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_sending_check" CHECK (("purchase_orders"."sent_at" is null) = ("purchase_orders"."sent_by" is null) and ("purchase_orders"."state" not in ('SENT', 'PARTIALLY_RECEIVED', 'RECEIVED') or "purchase_orders"."sent_at" is not null) and ("purchase_orders"."state" <> 'DRAFT' or "purchase_orders"."sent_at" is null));