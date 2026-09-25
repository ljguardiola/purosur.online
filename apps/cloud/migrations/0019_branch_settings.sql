CREATE TABLE "branch_settings" (
	"location_id" uuid PRIMARY KEY NOT NULL,
	"business_name" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"whatsapp_number" text DEFAULT '' NOT NULL,
	"instagram_handle" text DEFAULT '' NOT NULL,
	"weekday_hours" text DEFAULT '' NOT NULL,
	"saturday_hours" text DEFAULT '' NOT NULL,
	"sunday_hours" text DEFAULT '' NOT NULL,
	"timezone" text DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
	"expiring_lot_alert_days" integer DEFAULT 30 NOT NULL,
	"unreviewed_price_alert_days" integer DEFAULT 30 NOT NULL,
	"good_condition_return_days" integer DEFAULT 15 NOT NULL,
	"defective_return_days" integer DEFAULT 180 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "branch_settings_defective_return_days_floor" CHECK ("branch_settings"."defective_return_days" >= 180)
);
--> statement-breakpoint
ALTER TABLE "branch_settings" ADD CONSTRAINT "branch_settings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "branch_settings" ("location_id") SELECT "id" FROM "locations";