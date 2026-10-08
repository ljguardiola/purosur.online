CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount" bigint NOT NULL,
	"reason" text,
	"ref_type" text,
	"ref_id" text,
	"actor_id" text NOT NULL,
	"authorized_by" text,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"location_id" uuid NOT NULL,
	"register_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"opened_by" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"opening_float" bigint NOT NULL,
	"closed_by" text,
	"closed_at" timestamp with time zone,
	"expected_cash" bigint,
	"counted_cash" bigint,
	"difference" bigint
);
--> statement-breakpoint
CREATE TABLE "sale_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"list_unit_price" bigint NOT NULL,
	"price_list_id" uuid NOT NULL,
	"promotion_id" uuid,
	"discount_amount" bigint NOT NULL,
	"line_total" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"method" text NOT NULL,
	"provider" text NOT NULL,
	"amount" bigint NOT NULL,
	"tendered" bigint,
	"state" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"authorized_by" text,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"location_id" uuid NOT NULL,
	"register_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"total" bigint NOT NULL,
	"applied_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbox" ADD COLUMN "applied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inbox" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inbox" ADD COLUMN "quarantined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inbox" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_session_id_cash_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_device_id_register_installations_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."register_installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_device_id_register_installations_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."register_installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_session_id_cash_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbox_unapplied_aggregate_idx" ON "inbox" USING btree ("aggregate_type","aggregate_id","received_at") WHERE "inbox"."applied_at" is null;--> statement-breakpoint
CREATE INDEX "inbox_applied_aggregate_idx" ON "inbox" USING btree ("aggregate_type","aggregate_id") WHERE "inbox"."applied_at" is not null;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "sales" FROM cloud_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "sale_lines" FROM cloud_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "sale_payments" FROM cloud_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "cash_movements" FROM cloud_app;
