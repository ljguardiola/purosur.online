CREATE TABLE "contingency_ticket_recoveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"register_id" uuid NOT NULL,
	"restored_device_id" uuid NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"finished_by" uuid
);
--> statement-breakpoint
ALTER TABLE "contingency_ticket_recoveries" ADD CONSTRAINT "contingency_ticket_recoveries_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contingency_ticket_recoveries" ADD CONSTRAINT "contingency_ticket_recoveries_restored_device_id_register_installations_id_fk" FOREIGN KEY ("restored_device_id") REFERENCES "public"."register_installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contingency_ticket_recoveries" ADD CONSTRAINT "contingency_ticket_recoveries_finished_by_users_id_fk" FOREIGN KEY ("finished_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contingency_ticket_recoveries_restored_device_id_key" ON "contingency_ticket_recoveries" USING btree ("restored_device_id");