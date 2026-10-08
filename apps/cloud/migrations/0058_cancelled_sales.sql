CREATE TABLE "payment_refunds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"method" text NOT NULL,
	"provider" text NOT NULL,
	"amount" bigint NOT NULL,
	"state" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"done_by" text,
	"done_at" timestamp with time zone,
	CONSTRAINT "payment_refunds_state_check" CHECK ("payment_refunds"."state" in ('PENDING', 'APPROVED')),
	CONSTRAINT "payment_refunds_done_check" CHECK (("payment_refunds"."done_by" is null) = ("payment_refunds"."done_at" is null) and ("payment_refunds"."state" = 'APPROVED' or "payment_refunds"."done_by" is null))
);
--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "completed_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "state" text DEFAULT 'COMPLETED' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "state" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "cancellation_authorized_by" text;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_id_sale_id_key" UNIQUE("id","sale_id");--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_of_its_sale_fk" FOREIGN KEY ("payment_id","sale_id") REFERENCES "public"."sale_payments"("id","sale_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_refunds_pending_idx" ON "payment_refunds" USING btree ("occurred_at") WHERE "payment_refunds"."state" = 'PENDING';--> statement-breakpoint
CREATE INDEX "payment_refunds_payment_idx" ON "payment_refunds" USING btree ("payment_id");--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_state_check" CHECK ("sales"."state" in ('COMPLETED', 'CANCELLED'));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_state_matches_timestamps_check" CHECK (("sales"."state" = 'COMPLETED' and "sales"."completed_at" is not null and "sales"."cancelled_at" is null)
      or ("sales"."state" = 'CANCELLED' and "sales"."cancelled_at" is not null and "sales"."completed_at" is null));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_cancellation_authorizer_only_when_cancelled_check" CHECK ("sales"."cancellation_authorized_by" is null or "sales"."state" = 'CANCELLED');