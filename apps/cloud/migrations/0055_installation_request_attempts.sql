CREATE TYPE "public"."installation_request_endpoint" AS ENUM('push', 'pull', 'health_check');--> statement-breakpoint
CREATE TABLE "installation_request_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"endpoint" "installation_request_endpoint" NOT NULL,
	"attempted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "installation_request_attempts" ADD CONSTRAINT "installation_request_attempts_device_id_register_installations_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."register_installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "installation_request_attempts_device_endpoint_idx" ON "installation_request_attempts" USING btree ("device_id","endpoint","attempted_at");