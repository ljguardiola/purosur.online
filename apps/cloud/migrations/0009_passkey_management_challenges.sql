CREATE TYPE "public"."passkey_management_challenge_kind" AS ENUM('registration', 'removal');--> statement-breakpoint
CREATE TABLE "passkey_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" "passkey_management_challenge_kind" NOT NULL,
	"reauthentication_challenge" text NOT NULL,
	"registration_challenge" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "passkey_challenges" ADD CONSTRAINT "passkey_challenges_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "passkey_challenges_session_id_key" ON "passkey_challenges" USING btree ("session_id");