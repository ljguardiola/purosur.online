CREATE TABLE "mercado_pago_settlement_movements" (
	"source_id" text NOT NULL,
	"transaction_type" text NOT NULL,
	"transaction_date" timestamp with time zone NOT NULL,
	"external_reference" text,
	"payment_method" text,
	"payment_method_type" text,
	"gross_amount" bigint NOT NULL,
	"fee_amount" bigint NOT NULL,
	"financing_fee_amount" bigint NOT NULL,
	"taxes_amount" bigint NOT NULL,
	"net_amount" bigint NOT NULL,
	"money_release_date" timestamp with time zone,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mercado_pago_settlement_movements_pkey" PRIMARY KEY("source_id","transaction_type","transaction_date")
);
--> statement-breakpoint
CREATE TABLE "mercado_pago_settlement_report_requests" (
	"day" text PRIMARY KEY NOT NULL,
	"begin_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"refused" boolean NOT NULL,
	"recorded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "mercado_pago_settlement_movements_external_reference_lower_idx" ON "mercado_pago_settlement_movements" USING btree (lower("external_reference"));