CREATE TABLE "arca_vitality_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"ok" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arca_wsaa_tokens" (
	"service" text NOT NULL,
	"certificate_fingerprint" text NOT NULL,
	"token" text NOT NULL,
	"sign" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "arca_wsaa_tokens_service_certificate_fingerprint_pk" PRIMARY KEY("service","certificate_fingerprint")
);
--> statement-breakpoint
CREATE INDEX "arca_vitality_checks_checked_at_idx" ON "arca_vitality_checks" USING btree ("checked_at");