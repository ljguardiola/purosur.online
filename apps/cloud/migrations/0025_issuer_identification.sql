CREATE TABLE "issuer_identification" (
	"id" uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
	"legal_name" text,
	"gross_income_registration" text,
	"activity_start_date" date,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "issuer_identification_single_row" CHECK ("issuer_identification"."id" = '00000000-0000-0000-0000-000000000001'::uuid)
);
--> statement-breakpoint
INSERT INTO "issuer_identification" ("id") VALUES ('00000000-0000-0000-0000-000000000001');
