CREATE TABLE "buyer_identification_thresholds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amount" bigint NOT NULL,
	"valid_from" date NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" uuid NOT NULL,
	CONSTRAINT "buyer_identification_thresholds_amount_positive" CHECK ("buyer_identification_thresholds"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "buyer_tax_status_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"params_version" integer NOT NULL,
	"options" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buyer_tax_status_sets_params_version_positive" CHECK ("buyer_tax_status_sets"."params_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "issuer_identification_versions" (
	"version" integer PRIMARY KEY NOT NULL,
	"legal_name" text,
	"gross_income_registration" text,
	"activity_start_date" date,
	"authorized_cuit" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" uuid
);
--> statement-breakpoint
ALTER TABLE "buyer_identification_thresholds" ADD CONSTRAINT "buyer_identification_thresholds_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issuer_identification_versions" ADD CONSTRAINT "issuer_identification_versions_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "buyer_identification_thresholds_valid_from_key" ON "buyer_identification_thresholds" USING btree ("valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "buyer_tax_status_sets_params_version_key" ON "buyer_tax_status_sets" USING btree ("params_version");--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "buyer_identification_thresholds" FROM cloud_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "buyer_tax_status_sets" FROM cloud_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "issuer_identification_versions" FROM cloud_app;
--> statement-breakpoint
INSERT INTO "issuer_identification_versions" ("version", "legal_name", "gross_income_registration", "activity_start_date")
SELECT "version", "legal_name", "gross_income_registration", "activity_start_date" FROM "issuer_identification";
