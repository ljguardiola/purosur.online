ALTER TYPE "public"."passkey_management_challenge_kind" ADD VALUE 'role_edit';--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;