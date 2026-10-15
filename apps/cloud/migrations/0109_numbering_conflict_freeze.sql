CREATE TABLE "numbering_freezes" (
	"point_of_sale_number" integer PRIMARY KEY NOT NULL,
	"count_before_freeze" integer NOT NULL,
	"frozen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "numbering_freezes_non_negative_check" CHECK ("numbering_freezes"."count_before_freeze" >= 0)
);
--> statement-breakpoint
ALTER TABLE "fiscal_requests" ADD COLUMN "diagnosis" text;--> statement-breakpoint
ALTER TABLE "fiscal_requests" ADD COLUMN "diagnosed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fiscal_requests" ADD CONSTRAINT "fiscal_requests_diagnosis_check" CHECK ("fiscal_requests"."diagnosis" in ('date_behind', 'collision'));--> statement-breakpoint
ALTER TABLE "fiscal_requests" ADD CONSTRAINT "fiscal_requests_diagnosis_time_check" CHECK (("fiscal_requests"."diagnosis" is null) = ("fiscal_requests"."diagnosed_at" is null));--> statement-breakpoint
ALTER TABLE "fiscal_requests" ADD CONSTRAINT "fiscal_requests_diagnosis_answer_check" CHECK ("fiscal_requests"."diagnosis" is null or coalesce("fiscal_requests"."answer_kind" = 'unclear', false));