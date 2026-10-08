ALTER TABLE "alerts" ADD COLUMN "condition_cleared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "device_state" ADD COLUMN "last_accepted_push_at" timestamp with time zone;--> statement-breakpoint
INSERT INTO "device_state" ("device_id", "last_accepted_push_at")
SELECT "device_id", max("received_at") FROM "inbox" GROUP BY "device_id"
ON CONFLICT ("device_id") DO UPDATE SET "last_accepted_push_at" = excluded."last_accepted_push_at";