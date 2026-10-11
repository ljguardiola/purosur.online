CREATE TABLE "offline_authorization_code_acquisition_reports" (
	"fortnight_start" date NOT NULL,
	"outcome_kind" text NOT NULL,
	"reported_at" timestamp with time zone NOT NULL,
	CONSTRAINT "offline_authorization_code_acquisition_reports_pk" PRIMARY KEY("fortnight_start","outcome_kind")
);
