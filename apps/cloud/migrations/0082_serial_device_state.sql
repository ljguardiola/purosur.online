CREATE TABLE "serial_device_state" (
	"device_id" uuid NOT NULL,
	"role" text NOT NULL,
	"standing" text NOT NULL,
	"vendor_id" text,
	"product_id" text,
	"reported_at" timestamp with time zone NOT NULL,
	CONSTRAINT "serial_device_state_device_id_role_pk" PRIMARY KEY("device_id","role"),
	CONSTRAINT "serial_device_state_role_check" CHECK ("serial_device_state"."role" in ('scale', 'reader')),
	CONSTRAINT "serial_device_state_standing_check" CHECK ("serial_device_state"."standing" in ('matching', 'not_detected', 'mismatched', 'not_registered', 'unknown')),
	CONSTRAINT "serial_device_state_identity_check" CHECK (("serial_device_state"."vendor_id" is null) = ("serial_device_state"."product_id" is null))
);
--> statement-breakpoint
ALTER TABLE "serial_device_state" ADD CONSTRAINT "serial_device_state_device_id_register_installations_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."register_installations"("id") ON DELETE cascade ON UPDATE no action;