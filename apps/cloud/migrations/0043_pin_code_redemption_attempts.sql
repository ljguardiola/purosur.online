CREATE TYPE "public"."pin_code_redemption_attempt_key_kind" AS ENUM('source_address', 'register');--> statement-breakpoint
CREATE TABLE "pin_code_redemption_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_kind" "pin_code_redemption_attempt_key_kind" NOT NULL,
	"key_value" text NOT NULL,
	"attempted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "pin_code_redemption_attempts_key_idx" ON "pin_code_redemption_attempts" USING btree ("key_kind","key_value","attempted_at");--> statement-breakpoint
CREATE INDEX "pin_code_redemption_attempts_attempted_at_idx" ON "pin_code_redemption_attempts" USING btree ("attempted_at");