CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
);
--> statement-breakpoint
INSERT INTO "locations" DEFAULT VALUES;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location_id" uuid;--> statement-breakpoint
UPDATE "users" SET "location_id" = (SELECT "id" FROM "locations" LIMIT 1) WHERE "location_id" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "location_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_user_id_key" ON "user_roles" USING btree ("user_id");
