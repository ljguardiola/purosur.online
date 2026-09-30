ALTER TABLE "registers" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
-- Every register that exists before its changes were logged is logged once, so the register
-- pulling from the very first cursor receives its own.
INSERT INTO "changes" ("entity", "entity_id", "version", "op")
SELECT 'register', "id", "version", 'insert' FROM "registers" ORDER BY "id";
