ALTER TABLE "recovery_tokens" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
UPDATE "recovery_tokens" SET "sent_at" = "issued_at";
