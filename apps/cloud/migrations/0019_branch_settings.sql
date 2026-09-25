CREATE TABLE "branch_settings" (
	"location_id" uuid PRIMARY KEY NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"whatsapp_number" text DEFAULT '' NOT NULL,
	"instagram_handle" text DEFAULT '' NOT NULL,
	"weekday_opens_at" time,
	"weekday_closes_at" time,
	"saturday_opens_at" time,
	"saturday_closes_at" time,
	"sunday_opens_at" time,
	"sunday_closes_at" time,
	"expiring_lot_alert_days" integer DEFAULT 30 NOT NULL,
	"unreviewed_price_alert_days" integer DEFAULT 30 NOT NULL,
	"good_condition_return_days" integer DEFAULT 15 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "branch_settings_weekday_hours_shape" CHECK (("branch_settings"."weekday_opens_at" IS NULL AND "branch_settings"."weekday_closes_at" IS NULL) OR ("branch_settings"."weekday_opens_at" IS NOT NULL AND "branch_settings"."weekday_closes_at" IS NOT NULL AND "branch_settings"."weekday_closes_at" > "branch_settings"."weekday_opens_at")),
	CONSTRAINT "branch_settings_saturday_hours_shape" CHECK (("branch_settings"."saturday_opens_at" IS NULL AND "branch_settings"."saturday_closes_at" IS NULL) OR ("branch_settings"."saturday_opens_at" IS NOT NULL AND "branch_settings"."saturday_closes_at" IS NOT NULL AND "branch_settings"."saturday_closes_at" > "branch_settings"."saturday_opens_at")),
	CONSTRAINT "branch_settings_sunday_hours_shape" CHECK (("branch_settings"."sunday_opens_at" IS NULL AND "branch_settings"."sunday_closes_at" IS NULL) OR ("branch_settings"."sunday_opens_at" IS NOT NULL AND "branch_settings"."sunday_closes_at" IS NOT NULL AND "branch_settings"."sunday_closes_at" > "branch_settings"."sunday_opens_at"))
);
--> statement-breakpoint
ALTER TABLE "branch_settings" ADD CONSTRAINT "branch_settings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "branch_settings" ("location_id") SELECT "id" FROM "locations";