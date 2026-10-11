CREATE TABLE "arca_wsaa_ticket_refusals" (
	"service" text NOT NULL,
	"certificate_fingerprint" text NOT NULL,
	"refused_at" timestamp with time zone NOT NULL,
	CONSTRAINT "arca_wsaa_ticket_refusals_service_certificate_fingerprint_pk" PRIMARY KEY("service","certificate_fingerprint")
);
