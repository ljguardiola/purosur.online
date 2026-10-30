CREATE TABLE "supplier_price_list_removed_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"key_kind" text NOT NULL,
	"key_value" text NOT NULL,
	"price_cents" bigint,
	CONSTRAINT "supplier_price_list_removed_items_key_kind_check" CHECK ("supplier_price_list_removed_items"."key_kind" in ('code', 'description')),
	CONSTRAINT "supplier_price_list_removed_items_price_check" CHECK ("supplier_price_list_removed_items"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "supplier_price_list_rereads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"state" text NOT NULL,
	"read_failure" text,
	"file_content_kind" text NOT NULL,
	"file_byte_size" bigint NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"requested_by" uuid NOT NULL,
	"sent_at" timestamp with time zone,
	"sent_on" date,
	"finished_at" timestamp with time zone,
	CONSTRAINT "supplier_price_list_rereads_state_check" CHECK ("supplier_price_list_rereads"."state" in ('READING', 'READ', 'READ_FAILED')),
	CONSTRAINT "supplier_price_list_rereads_file_content_kind_check" CHECK ("supplier_price_list_rereads"."file_content_kind" in ('PDF', 'HTML', 'STORE_CATALOG')),
	CONSTRAINT "supplier_price_list_rereads_read_failure_check" CHECK ("supplier_price_list_rereads"."read_failure" is null or "supplier_price_list_rereads"."read_failure" in ('unreadable_document', 'no_items_found', 'reading_unavailable', 'interrupted'))
);
--> statement-breakpoint
ALTER TABLE "supplier_price_list_removed_items" ADD CONSTRAINT "supplier_price_list_removed_items_list_id_supplier_price_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."supplier_price_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_price_list_rereads" ADD CONSTRAINT "supplier_price_list_rereads_list_id_supplier_price_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."supplier_price_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_price_list_rereads" ADD CONSTRAINT "supplier_price_list_rereads_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_price_list_rereads" ADD CONSTRAINT "supplier_price_list_rereads_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_price_list_removed_items_list_idx" ON "supplier_price_list_removed_items" USING btree ("list_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_price_list_rereads_reading_list_key" ON "supplier_price_list_rereads" USING btree ("list_id") WHERE "supplier_price_list_rereads"."state" = 'READING';--> statement-breakpoint
CREATE INDEX "supplier_price_list_rereads_location_sent_on_idx" ON "supplier_price_list_rereads" USING btree ("location_id","sent_on");