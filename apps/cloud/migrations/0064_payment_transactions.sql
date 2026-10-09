ALTER TYPE "public"."installation_request_endpoint" ADD VALUE 'payment_order';--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"register_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"method" text NOT NULL,
	"provider" text NOT NULL,
	"amount" bigint NOT NULL,
	"state" text NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"provider_order_id" text,
	"creation_outcome_unknown" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"state_read_at" timestamp with time zone,
	CONSTRAINT "payment_transactions_provider_order_id_unique" UNIQUE("provider_order_id"),
	CONSTRAINT "payment_transactions_kind_check" CHECK ("payment_transactions"."kind" = 'SALE'),
	CONSTRAINT "payment_transactions_method_check" CHECK ("payment_transactions"."method" = 'QR'),
	CONSTRAINT "payment_transactions_provider_check" CHECK ("payment_transactions"."provider" = 'MERCADOPAGO_QR'),
	CONSTRAINT "payment_transactions_amount_check" CHECK ("payment_transactions"."amount" > 0),
	CONSTRAINT "payment_transactions_state_check" CHECK ("payment_transactions"."state" in ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED', 'EXPIRED'))
);
--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_transactions_register_idx" ON "payment_transactions" USING btree ("register_id");