ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_state_check";--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "sent_by" uuid;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_sending_check" CHECK (("purchase_orders"."sent_at" is null) = ("purchase_orders"."sent_by" is null) and ("purchase_orders"."state" <> 'SENT' or "purchase_orders"."sent_at" is not null) and ("purchase_orders"."state" <> 'DRAFT' or "purchase_orders"."sent_at" is null));--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_state_check" CHECK ("purchase_orders"."state" in ('DRAFT', 'SENT', 'CANCELLED'));