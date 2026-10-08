CREATE TABLE "arca_invoicing_evidence" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"last_call_ok_at" timestamp with time zone NOT NULL,
	CONSTRAINT "arca_invoicing_evidence_single_row_check" CHECK ("arca_invoicing_evidence"."id")
);
--> statement-breakpoint
CREATE TABLE "fiscal_requests" (
	"fiscal_document_id" uuid PRIMARY KEY NOT NULL,
	"register_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"point_of_sale" integer NOT NULL,
	"number" integer NOT NULL,
	"issued_on" date NOT NULL,
	"total" bigint NOT NULL,
	"buyer_tax_status_code" integer NOT NULL,
	"sale_event" jsonb NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"not_after" timestamp with time zone NOT NULL,
	"answer_kind" text,
	"authorization_code" text,
	"authorization_code_due_on" date,
	"rejection_codes" integer[],
	"answered_at" timestamp with time zone,
	CONSTRAINT "fiscal_requests_answer_kind_check" CHECK ("fiscal_requests"."answer_kind" in ('authorized', 'rejected', 'not_attempted', 'unclear')),
	CONSTRAINT "fiscal_requests_answer_time_check" CHECK (("fiscal_requests"."answer_kind" is null) = ("fiscal_requests"."answered_at" is null)),
	CONSTRAINT "fiscal_requests_authorization_check" CHECK (coalesce("fiscal_requests"."answer_kind" = 'authorized', false) = ("fiscal_requests"."authorization_code" is not null)
        and ("fiscal_requests"."authorization_code" is null) = ("fiscal_requests"."authorization_code_due_on" is null)),
	CONSTRAINT "fiscal_requests_rejection_check" CHECK (coalesce("fiscal_requests"."answer_kind" = 'rejected', false) = ("fiscal_requests"."rejection_codes" is not null))
);
--> statement-breakpoint
CREATE TABLE "tax_authority_last_authorized_numbers" (
	"point_of_sale_number" integer PRIMARY KEY NOT NULL,
	"last_authorized" integer NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "tax_authority_last_authorized_numbers_non_negative_check" CHECK ("tax_authority_last_authorized_numbers"."last_authorized" >= 0)
);
--> statement-breakpoint
ALTER TABLE "fiscal_requests" ADD CONSTRAINT "fiscal_requests_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fiscal_requests_point_of_sale_idx" ON "fiscal_requests" USING btree ("point_of_sale");