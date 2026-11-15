CREATE TYPE "public"."alert_email_delivery_status" AS ENUM('pending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."alert_email_stage" AS ENUM('opened', 'escalated', 'resolved');--> statement-breakpoint
CREATE TABLE "alert_email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"stage" "alert_email_stage" NOT NULL,
	"level" "alert_level" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"status" "alert_email_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"error" text,
	"provider_message_id" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_email_deliveries" ADD CONSTRAINT "alert_email_deliveries_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_email_deliveries" ADD CONSTRAINT "alert_email_deliveries_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_email_deliveries_alert_recipient_stage_key" ON "alert_email_deliveries" USING btree ("alert_id","recipient_user_id","stage");--> statement-breakpoint
CREATE INDEX "alert_email_deliveries_status_idx" ON "alert_email_deliveries" USING btree ("status");