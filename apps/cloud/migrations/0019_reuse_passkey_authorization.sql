-- Every pending challenge is deleted. The per-action kinds removed from the enum below are
-- worthless once their routes are gone, and a pending `registration` was issued without the
-- passkey authorization that `registration-options` now requires before `POST /users/passkeys`
-- will accept it. A pending row lives only `PASSKEY_CHALLENGE_TTL_MS` (5 minutes).
DELETE FROM "passkey_challenges";--> statement-breakpoint
ALTER TABLE "passkey_challenges" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."passkey_management_challenge_kind";--> statement-breakpoint
CREATE TYPE "public"."passkey_management_challenge_kind" AS ENUM('registration', 'session_authorization');--> statement-breakpoint
ALTER TABLE "passkey_challenges" ALTER COLUMN "kind" SET DATA TYPE "public"."passkey_management_challenge_kind" USING "kind"::"public"."passkey_management_challenge_kind";--> statement-breakpoint
DROP INDEX "passkey_challenges_session_id_key";--> statement-breakpoint
ALTER TABLE "passkey_challenges" ALTER COLUMN "reauthentication_challenge" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "passkey_authorized_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "passkey_challenges_session_id_kind_key" ON "passkey_challenges" USING btree ("session_id","kind");
