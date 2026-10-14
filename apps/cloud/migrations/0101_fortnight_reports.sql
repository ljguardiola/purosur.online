CREATE TYPE "public"."fortnight_report_state" AS ENUM('blocked', 'ready', 'submitting', 'refused', 'accepted');--> statement-breakpoint
CREATE TABLE "fortnight_reports" (
	"point_of_sale_number" integer NOT NULL,
	"fortnight_start" date NOT NULL,
	"fortnight_end" date NOT NULL,
	"state" "fortnight_report_state" NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"rejections" jsonb,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "fortnight_reports_pkey" PRIMARY KEY("point_of_sale_number","fortnight_start"),
	CONSTRAINT "fortnight_reports_fortnight_ends_after_start" CHECK ("fortnight_reports"."fortnight_end" > "fortnight_reports"."fortnight_start")
);
--> statement-breakpoint
ALTER TABLE "device_state" ADD COLUMN "caught_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fortnight_reports" ADD CONSTRAINT "fortnight_reports_point_of_sale_number_point_of_sale_claims_point_of_sale_number_fk" FOREIGN KEY ("point_of_sale_number") REFERENCES "public"."point_of_sale_claims"("point_of_sale_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fortnight_reports" ADD CONSTRAINT "fortnight_reports_fortnight_start_caea_codes_fortnight_start_fk" FOREIGN KEY ("fortnight_start") REFERENCES "public"."caea_codes"("fortnight_start") ON DELETE no action ON UPDATE no action;