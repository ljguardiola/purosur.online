CREATE TYPE "public"."change_op" AS ENUM('insert', 'update');--> statement-breakpoint
CREATE TABLE "changes" (
	"change_seq" bigserial PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"op" "change_op" NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"origin_device_id" uuid
);
--> statement-breakpoint
CREATE TABLE "device_state" (
	"device_id" uuid PRIMARY KEY NOT NULL,
	"last_pull_since" bigint NOT NULL,
	"last_pulled_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_state" ADD CONSTRAINT "device_state_device_id_register_installations_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."register_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "changes_entity_entity_id_idx" ON "changes" USING btree ("entity","entity_id","change_seq");--> statement-breakpoint
-- Settings already saved before the log existed are logged once, so a register pulling from the
-- very first cursor receives them.
INSERT INTO "changes" ("entity", "entity_id", "version", "op")
SELECT 'branch_settings', "location_id", "version", 'insert' FROM "branch_settings" ORDER BY "location_id";--> statement-breakpoint
-- Append-only, the same way audit_log and prices are: a register catches up from any cursor only
-- while no change is ever rewritten or removed.
REVOKE UPDATE, DELETE, TRUNCATE ON "changes" FROM cloud_app;
