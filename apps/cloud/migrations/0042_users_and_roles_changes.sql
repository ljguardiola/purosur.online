ALTER TABLE "changes" ADD COLUMN "location_id" uuid;--> statement-breakpoint
CREATE INDEX "changes_entity_location_id_idx" ON "changes" USING btree ("entity","location_id","change_seq");
--> statement-breakpoint
-- Every user and role that exists before their changes were logged is logged once, so a register
-- pulling from the very first cursor receives them.
INSERT INTO "changes" ("entity", "entity_id", "version", "op", "location_id")
SELECT 'user', "id", "version", 'insert', "location_id" FROM "users" ORDER BY "id";--> statement-breakpoint
INSERT INTO "changes" ("entity", "entity_id", "version", "op")
SELECT 'role', "id", "version", 'insert' FROM "roles" ORDER BY "id";
