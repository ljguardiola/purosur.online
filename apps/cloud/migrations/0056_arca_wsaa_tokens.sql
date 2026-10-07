CREATE TABLE "arca_wsaa_tokens" (
	"service" text NOT NULL,
	"certificate_fingerprint" text NOT NULL,
	"token" text NOT NULL,
	"sign" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "arca_wsaa_tokens_service_certificate_fingerprint_pk" PRIMARY KEY("service","certificate_fingerprint")
);
