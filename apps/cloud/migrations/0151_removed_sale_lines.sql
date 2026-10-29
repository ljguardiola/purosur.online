CREATE TABLE "removed_sale_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"register_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"weight_source" text,
	"line_total" bigint NOT NULL,
	"removed_at" timestamp with time zone NOT NULL,
	"applied_at" timestamp with time zone NOT NULL,
	"origin_event_id" uuid NOT NULL,
	CONSTRAINT "removed_sale_lines_weight_source_check" CHECK ("removed_sale_lines"."weight_source" IN ('SCALE', 'MANUAL'))
);
--> statement-breakpoint
ALTER TABLE "removed_sale_lines" ADD CONSTRAINT "removed_sale_lines_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "removed_sale_lines" ADD CONSTRAINT "removed_sale_lines_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "removed_sale_lines" ADD CONSTRAINT "removed_sale_lines_device_id_register_installations_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."register_installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "removed_sale_lines" ADD CONSTRAINT "removed_sale_lines_session_id_cash_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "removed_sale_lines_location_id_removed_at_idx" ON "removed_sale_lines" USING btree ("location_id","removed_at");--> statement-breakpoint
CREATE INDEX "removed_sale_lines_register_id_removed_at_idx" ON "removed_sale_lines" USING btree ("register_id","removed_at");