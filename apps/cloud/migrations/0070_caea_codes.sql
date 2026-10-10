CREATE TYPE "public"."caea_code_origin" AS ENUM('requested', 'recovered');--> statement-breakpoint
CREATE TABLE "caea_codes" (
	"fortnight_start" date PRIMARY KEY NOT NULL,
	"fortnight_end" date NOT NULL,
	"code" text NOT NULL,
	"report_deadline" date NOT NULL,
	"obtained_at" timestamp with time zone NOT NULL,
	"obtained_through" "caea_code_origin" NOT NULL,
	CONSTRAINT "caea_codes_fortnight_ends_after_start" CHECK ("caea_codes"."fortnight_end" > "caea_codes"."fortnight_start")
);
