CREATE TABLE "exception_share_breaches" (
	"fiscal_address_id" uuid NOT NULL,
	"month" text NOT NULL,
	"exception_count" integer NOT NULL,
	"total_count" integer NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "exception_share_breaches_pkey" PRIMARY KEY("fiscal_address_id","month"),
	CONSTRAINT "exception_share_breaches_month_format" CHECK ("exception_share_breaches"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "exception_share_breaches_counts_consistent" CHECK ("exception_share_breaches"."exception_count" >= 0 and "exception_share_breaches"."exception_count" <= "exception_share_breaches"."total_count")
);
--> statement-breakpoint
ALTER TABLE "exception_share_breaches" ADD CONSTRAINT "exception_share_breaches_fiscal_address_id_fiscal_addresses_id_fk" FOREIGN KEY ("fiscal_address_id") REFERENCES "public"."fiscal_addresses"("id") ON DELETE no action ON UPDATE no action;