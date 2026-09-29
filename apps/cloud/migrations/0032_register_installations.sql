CREATE TYPE "public"."register_enrollment_attempt_key_kind" AS ENUM('source_address', 'register');--> statement-breakpoint
CREATE TABLE "register_enrollment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_kind" "register_enrollment_attempt_key_kind" NOT NULL,
	"key_value" text NOT NULL,
	"attempted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "register_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"register_id" uuid NOT NULL,
	"token_lookup_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"hostname" text NOT NULL,
	"windows_version" text NOT NULL,
	"enrolled_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "register_enrollment_codes" ADD COLUMN "code_lookup" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "register_enrollment_codes" ALTER COLUMN "code_lookup" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "register_installations" ADD CONSTRAINT "register_installations_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "register_enrollment_attempts_key_idx" ON "register_enrollment_attempts" USING btree ("key_kind","key_value","attempted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "register_installations_token_lookup_prefix_key" ON "register_installations" USING btree ("token_lookup_prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "register_installations_active_register_id_key" ON "register_installations" USING btree ("register_id") WHERE "register_installations"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "register_enrollment_codes_code_lookup_idx" ON "register_enrollment_codes" USING btree ("code_lookup");