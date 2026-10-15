CREATE TYPE "public"."document_type_report_state" AS ENUM('blocked', 'submitting', 'refused', 'accepted');--> statement-breakpoint
CREATE TYPE "public"."fortnight_report_movement" AS ENUM('none', 'documents');--> statement-breakpoint
ALTER TYPE "public"."fortnight_report_state" ADD VALUE 'needs_regularization';--> statement-breakpoint
CREATE TABLE "fortnight_document_reports" (
	"point_of_sale_number" integer NOT NULL,
	"fortnight_start" date NOT NULL,
	"fortnight_end" date NOT NULL,
	"document_type" text NOT NULL,
	"state" "document_type_report_state" NOT NULL,
	"reported_through" integer NOT NULL,
	"rejected_number" integer,
	"rejections" jsonb,
	"last_attempt_at" timestamp with time zone,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "fortnight_document_reports_pkey" PRIMARY KEY("point_of_sale_number","fortnight_start","document_type"),
	CONSTRAINT "fortnight_document_reports_fortnight_ends_after_start" CHECK ("fortnight_document_reports"."fortnight_end" > "fortnight_document_reports"."fortnight_start"),
	CONSTRAINT "fortnight_document_reports_document_type_known" CHECK ("fortnight_document_reports"."document_type" in ('factura_c'))
);
--> statement-breakpoint
ALTER TABLE "fortnight_reports" ADD COLUMN "movement" "fortnight_report_movement";--> statement-breakpoint
ALTER TABLE "fortnight_document_reports" ADD CONSTRAINT "fortnight_document_reports_point_of_sale_number_point_of_sale_claims_point_of_sale_number_fk" FOREIGN KEY ("point_of_sale_number") REFERENCES "public"."point_of_sale_claims"("point_of_sale_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fortnight_document_reports" ADD CONSTRAINT "fortnight_document_reports_fortnight_start_caea_codes_fortnight_start_fk" FOREIGN KEY ("fortnight_start") REFERENCES "public"."caea_codes"("fortnight_start") ON DELETE no action ON UPDATE no action;