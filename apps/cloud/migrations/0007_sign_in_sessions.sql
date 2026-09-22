CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sign_in_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sign_in_failures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_address" text NOT NULL,
	"attempted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sign_in_lockouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_address" text NOT NULL,
	"blocked_until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "actor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_session_id_hash_key" ON "sessions" USING btree ("session_id_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "sign_in_challenges_challenge_key" ON "sign_in_challenges" USING btree ("challenge");--> statement-breakpoint
CREATE INDEX "sign_in_failures_source_address_idx" ON "sign_in_failures" USING btree ("source_address","attempted_at");--> statement-breakpoint
CREATE INDEX "sign_in_failures_attempted_at_idx" ON "sign_in_failures" USING btree ("attempted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sign_in_lockouts_source_address_key" ON "sign_in_lockouts" USING btree ("source_address");