ALTER TABLE "alerts" ADD COLUMN "condition_cleared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "device_state" ADD COLUMN "last_accepted_push_at" timestamp with time zone;