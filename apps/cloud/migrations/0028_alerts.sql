CREATE TYPE "public"."alert_audience" AS ENUM('local', 'all');--> statement-breakpoint
CREATE TYPE "public"."alert_delivery_channel" AS ENUM('backoffice');--> statement-breakpoint
CREATE TYPE "public"."alert_delivery_status" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."alert_level" AS ENUM('informational', 'warning', 'critical');--> statement-breakpoint
CREATE TABLE "alert_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"channel" "alert_delivery_channel" DEFAULT 'backoffice' NOT NULL,
	"status" "alert_delivery_status" DEFAULT 'sent' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"scope" text NOT NULL,
	"level" "alert_level" NOT NULL,
	"audience" "alert_audience" NOT NULL,
	"location_id" uuid,
	"detail" jsonb NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"escalate_at" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	CONSTRAINT "alerts_location_id_matches_audience" CHECK (("alerts"."audience" = 'local' AND "alerts"."location_id" IS NOT NULL) OR ("alerts"."audience" = 'all' AND "alerts"."location_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_deliveries_alert_recipient_channel_key" ON "alert_deliveries" USING btree ("alert_id","recipient_user_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_open_dedup_key" ON "alerts" USING btree ("kind","scope") WHERE "alerts"."resolved_at" IS NULL;--> statement-breakpoint
CREATE INDEX "alerts_level_idx" ON "alerts" USING btree ("level");--> statement-breakpoint
CREATE INDEX "alerts_resolved_at_idx" ON "alerts" USING btree ("resolved_at");