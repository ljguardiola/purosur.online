CREATE TABLE "supplier_price_list_extraction_caps" (
	"location_id" uuid PRIMARY KEY NOT NULL,
	"daily_cap" integer NOT NULL,
	CONSTRAINT "supplier_price_list_extraction_caps_cap_check" CHECK ("supplier_price_list_extraction_caps"."daily_cap" > 0)
);
--> statement-breakpoint
CREATE TABLE "supplier_price_list_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"supplier_code" text,
	"presentation" text,
	"price_cents" bigint,
	"page" integer,
	CONSTRAINT "supplier_price_list_rows_list_position_key" UNIQUE("list_id","position"),
	CONSTRAINT "supplier_price_list_rows_price_check" CHECK ("supplier_price_list_rows"."price_cents" >= 0),
	CONSTRAINT "supplier_price_list_rows_page_check" CHECK ("supplier_price_list_rows"."page" > 0)
);
--> statement-breakpoint
CREATE TABLE "supplier_price_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"file_name" text,
	"file_byte_size" bigint,
	"source_url" text,
	"state" text NOT NULL,
	"read_failure" text,
	"list_date" date,
	"uploaded_at" timestamp with time zone NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"sent_at" timestamp with time zone,
	"sent_on" date,
	"extracted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" uuid,
	"discarded_at" timestamp with time zone,
	"discarded_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "supplier_price_lists_source_kind_check" CHECK ("supplier_price_lists"."source_kind" in ('PDF', 'WEB')),
	CONSTRAINT "supplier_price_lists_state_check" CHECK ("supplier_price_lists"."state" in ('READING', 'READ_FAILED', 'EXTRACTED', 'REVIEWED', 'DISCARDED')),
	CONSTRAINT "supplier_price_lists_read_failure_check" CHECK ("supplier_price_lists"."read_failure" is null or "supplier_price_lists"."read_failure" in ('unreadable_document', 'no_items_found', 'reading_unavailable', 'interrupted'))
);
--> statement-breakpoint
ALTER TABLE "supplier_price_list_extraction_caps" ADD CONSTRAINT "supplier_price_list_extraction_caps_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_price_list_rows" ADD CONSTRAINT "supplier_price_list_rows_list_id_supplier_price_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."supplier_price_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_price_lists" ADD CONSTRAINT "supplier_price_lists_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_price_lists" ADD CONSTRAINT "supplier_price_lists_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_price_lists" ADD CONSTRAINT "supplier_price_lists_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_price_lists" ADD CONSTRAINT "supplier_price_lists_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_price_lists" ADD CONSTRAINT "supplier_price_lists_discarded_by_users_id_fk" FOREIGN KEY ("discarded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_price_lists_location_sent_on_idx" ON "supplier_price_lists" USING btree ("location_id","sent_on");--> statement-breakpoint
CREATE INDEX "supplier_price_lists_supplier_state_idx" ON "supplier_price_lists" USING btree ("supplier_id","state");