CREATE TABLE "recovery_rate_limit_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_kind" "recovery_rate_limit_key_kind" NOT NULL,
	"key_value" text NOT NULL,
	"attempted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DROP TABLE "recovery_rate_limit_counters" CASCADE;--> statement-breakpoint
CREATE INDEX "recovery_rate_limit_attempts_key_idx" ON "recovery_rate_limit_attempts" USING btree ("key_kind","key_value","attempted_at");--> statement-breakpoint
CREATE INDEX "recovery_rate_limit_attempts_attempted_at_idx" ON "recovery_rate_limit_attempts" USING btree ("attempted_at");