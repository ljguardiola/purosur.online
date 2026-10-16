CREATE TABLE "clock_corrections" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"register_id" uuid NOT NULL,
	"point_of_sale" integer NOT NULL,
	"document_type" text NOT NULL,
	"previous_reading" timestamp with time zone NOT NULL,
	"corrected_reading" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"corrected_at" timestamp with time zone NOT NULL,
	"alert_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "clock_corrections_document_type_known" CHECK ("clock_corrections"."document_type" in ('factura_c')),
	CONSTRAINT "clock_corrections_lowers_the_reading" CHECK ("clock_corrections"."corrected_reading" < "clock_corrections"."previous_reading")
);
--> statement-breakpoint
ALTER TABLE "tax_authority_last_authorized_numbers" ADD COLUMN "issued_on" date;--> statement-breakpoint
ALTER TABLE "clock_corrections" ADD CONSTRAINT "clock_corrections_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_corrections" ADD CONSTRAINT "clock_corrections_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_corrections" ADD CONSTRAINT "clock_corrections_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clock_corrections_register_corrected_at_idx" ON "clock_corrections" USING btree ("register_id","corrected_at");