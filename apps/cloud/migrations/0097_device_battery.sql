ALTER TABLE "device_state" ADD COLUMN "battery_present" boolean;--> statement-breakpoint
ALTER TABLE "device_state" ADD COLUMN "battery_charge_percent" integer;--> statement-breakpoint
ALTER TABLE "device_state" ADD COLUMN "battery_health_percent" integer;--> statement-breakpoint
ALTER TABLE "device_state" ADD COLUMN "battery_on_battery" boolean;--> statement-breakpoint
ALTER TABLE "device_state" ADD COLUMN "battery_on_battery_minutes" integer;--> statement-breakpoint
ALTER TABLE "device_state" ADD COLUMN "battery_reported_at" timestamp with time zone;