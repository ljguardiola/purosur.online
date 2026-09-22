CREATE TYPE "public"."recovery_rate_limit_key_kind" AS ENUM('destination_address', 'source_address');--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" integer NOT NULL,
	"transports" jsonb,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_rate_limit_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_kind" "recovery_rate_limit_key_kind" NOT NULL,
	"key_value" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"registration_challenge" text
);
--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_tokens" ADD CONSTRAINT "recovery_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "passkeys_credential_id_key" ON "passkeys" USING btree ("credential_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_rate_limit_counters_key" ON "recovery_rate_limit_counters" USING btree ("key_kind","key_value","window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_tokens_token_hash_key" ON "recovery_tokens" USING btree ("token_hash");