CREATE TYPE "public"."installation_revocation_reason" AS ENUM('replaced', 'outbox_chain_broken');--> statement-breakpoint
CREATE TABLE "refused_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"device_seq" bigint NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"event_type" text NOT NULL,
	"schema_version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_id" text NOT NULL,
	"chain_hmac" text NOT NULL,
	"refused_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "register_installations" ADD COLUMN "revocation_reason" "installation_revocation_reason";--> statement-breakpoint
ALTER TABLE "refused_events" ADD CONSTRAINT "refused_events_device_id_register_installations_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."register_installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "register_installations" SET "revocation_reason" = 'replaced' WHERE "revoked_at" IS NOT NULL;
