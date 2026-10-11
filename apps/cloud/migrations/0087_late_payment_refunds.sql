ALTER TABLE "payment_refunds" DROP CONSTRAINT "payment_refunds_state_check";--> statement-breakpoint
ALTER TABLE "payment_refunds" ALTER COLUMN "payment_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN "payment_transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN "origin" text DEFAULT 'sale_cancelled' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN "discarded_by" text;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN "discarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_transaction_id_payment_transactions_id_fk" FOREIGN KEY ("payment_transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_transaction_id_unique" UNIQUE("payment_transaction_id");--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_origin_check" CHECK ("payment_refunds"."origin" in ('sale_cancelled', 'late_payment'));--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_one_source_check" CHECK (("payment_refunds"."payment_id" is null) <> ("payment_refunds"."payment_transaction_id" is null));--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_discarded_check" CHECK (("payment_refunds"."discarded_by" is null) = ("payment_refunds"."discarded_at" is null) and ("payment_refunds"."state" = 'DISCARDED' or "payment_refunds"."discarded_by" is null));--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_state_check" CHECK ("payment_refunds"."state" in ('PENDING', 'APPROVED', 'DISCARDED'));