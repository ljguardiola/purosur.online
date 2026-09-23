ALTER TABLE "passkeys" ADD COLUMN "name" text DEFAULT 'Passkey' NOT NULL;--> statement-breakpoint
ALTER TABLE "passkeys" ALTER COLUMN "name" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "passkeys" ADD COLUMN "last_used_at" timestamp with time zone;