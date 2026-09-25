CREATE TABLE "branch_hours" (
	"location_id" uuid NOT NULL,
	"day_of_week" smallint NOT NULL,
	"position" integer NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	CONSTRAINT "branch_hours_location_id_day_of_week_position_pk" PRIMARY KEY("location_id","day_of_week","position"),
	CONSTRAINT "branch_hours_day_of_week_check" CHECK ("branch_hours"."day_of_week" BETWEEN 1 AND 7),
	CONSTRAINT "branch_hours_closes_after_opens" CHECK ("branch_hours"."closes_at" > "branch_hours"."opens_at")
);
--> statement-breakpoint
ALTER TABLE "branch_hours" ADD CONSTRAINT "branch_hours_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "branch_hours" ("location_id", "day_of_week", "position", "opens_at", "closes_at") SELECT "location_id", "day_of_week", 0, "weekday_opens_at", "weekday_closes_at" FROM "branch_settings" CROSS JOIN (VALUES (1), (2), (3), (4), (5)) AS "weekdays"("day_of_week") WHERE "weekday_opens_at" IS NOT NULL AND "weekday_closes_at" IS NOT NULL;--> statement-breakpoint
INSERT INTO "branch_hours" ("location_id", "day_of_week", "position", "opens_at", "closes_at") SELECT "location_id", 6, 0, "saturday_opens_at", "saturday_closes_at" FROM "branch_settings" WHERE "saturday_opens_at" IS NOT NULL AND "saturday_closes_at" IS NOT NULL;--> statement-breakpoint
INSERT INTO "branch_hours" ("location_id", "day_of_week", "position", "opens_at", "closes_at") SELECT "location_id", 7, 0, "sunday_opens_at", "sunday_closes_at" FROM "branch_settings" WHERE "sunday_opens_at" IS NOT NULL AND "sunday_closes_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "branch_settings" DROP CONSTRAINT "branch_settings_weekday_hours_shape";--> statement-breakpoint
ALTER TABLE "branch_settings" DROP CONSTRAINT "branch_settings_saturday_hours_shape";--> statement-breakpoint
ALTER TABLE "branch_settings" DROP CONSTRAINT "branch_settings_sunday_hours_shape";--> statement-breakpoint
ALTER TABLE "branch_settings" DROP COLUMN "weekday_opens_at";--> statement-breakpoint
ALTER TABLE "branch_settings" DROP COLUMN "weekday_closes_at";--> statement-breakpoint
ALTER TABLE "branch_settings" DROP COLUMN "saturday_opens_at";--> statement-breakpoint
ALTER TABLE "branch_settings" DROP COLUMN "saturday_closes_at";--> statement-breakpoint
ALTER TABLE "branch_settings" DROP COLUMN "sunday_opens_at";--> statement-breakpoint
ALTER TABLE "branch_settings" DROP COLUMN "sunday_closes_at";
