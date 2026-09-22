CREATE TYPE "public"."recovery_rejected_attempt_kind" AS ENUM('request', 'registration_options', 'redeem');--> statement-breakpoint
CREATE TABLE "recovery_rejected_attempt_accumulator" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "recovery_rejected_attempt_kind" NOT NULL,
	"key_hash" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"first_at" timestamp with time zone NOT NULL,
	"last_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_rejected_attempt_accumulator_key" ON "recovery_rejected_attempt_accumulator" USING btree ("kind","key_hash","window_start");--> statement-breakpoint
CREATE INDEX "recovery_rejected_attempt_accumulator_window_idx" ON "recovery_rejected_attempt_accumulator" USING btree ("window_start");