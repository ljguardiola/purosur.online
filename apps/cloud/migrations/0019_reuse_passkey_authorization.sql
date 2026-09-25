-- Every kind but `registration` is being removed from the enum below (the per-action step-up
-- challenges it named all moved onto `sessions.passkey_authorized_at` instead); a pending row of
-- one of those kinds is short-lived (`PASSKEY_CHALLENGE_TTL_MS`, 5 minutes) and worthless once its
-- own route is gone, so it is deleted rather than migrated, the same way the enum cast below would
-- otherwise fail on it.
DELETE FROM "passkey_challenges" WHERE "kind" NOT IN ('registration');--> statement-breakpoint
ALTER TABLE "passkey_challenges" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."passkey_management_challenge_kind";--> statement-breakpoint
CREATE TYPE "public"."passkey_management_challenge_kind" AS ENUM('registration', 'session_authorization');--> statement-breakpoint
ALTER TABLE "passkey_challenges" ALTER COLUMN "kind" SET DATA TYPE "public"."passkey_management_challenge_kind" USING "kind"::"public"."passkey_management_challenge_kind";--> statement-breakpoint
DROP INDEX "passkey_challenges_session_id_key";--> statement-breakpoint
ALTER TABLE "passkey_challenges" ALTER COLUMN "reauthentication_challenge" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "passkey_authorized_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "passkey_challenges_session_id_kind_key" ON "passkey_challenges" USING btree ("session_id","kind");
