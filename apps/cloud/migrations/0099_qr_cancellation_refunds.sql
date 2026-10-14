ALTER TABLE "payment_refunds" DROP CONSTRAINT "payment_refunds_one_source_check";--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN "origin_event_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN "confirmed_by" text;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN "provider_refund_id" text;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN "attempt_key" text;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN "last_refusal_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_refunds_attempt_key_unique" ON "payment_refunds" USING btree ("attempt_key") WHERE "payment_refunds"."attempt_key" is not null;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_source_check" CHECK (("payment_refunds"."origin" = 'late_payment' and "payment_refunds"."payment_id" is null and "payment_refunds"."payment_transaction_id" is not null and "payment_refunds"."origin_event_id" is null) or ("payment_refunds"."origin" = 'sale_cancelled' and "payment_refunds"."payment_id" is not null));--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_confirmation_check" CHECK (("payment_refunds"."confirmed_by" is null) = ("payment_refunds"."confirmed_at" is null));--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_attempt_confirmed_check" CHECK ("payment_refunds"."attempt_key" is null or "payment_refunds"."confirmed_at" is not null);--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_sent_check" CHECK (("payment_refunds"."sent_at" is null) = ("payment_refunds"."provider_refund_id" is null) and ("payment_refunds"."sent_at" is null or "payment_refunds"."confirmed_at" is not null));