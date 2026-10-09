CREATE TABLE "payment_notification_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_address" text NOT NULL,
	"attempted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "payment_notification_attempts_source_address_idx" ON "payment_notification_attempts" USING btree ("source_address","attempted_at");--> statement-breakpoint
CREATE INDEX "payment_notification_attempts_attempted_at_idx" ON "payment_notification_attempts" USING btree ("attempted_at");--> statement-breakpoint
CREATE INDEX "payment_transactions_provider_order_id_lower_idx" ON "payment_transactions" USING btree (lower("provider_order_id"));