CREATE TABLE "fiscal_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"street_address" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point_of_sale_claims" (
	"point_of_sale_number" integer PRIMARY KEY NOT NULL,
	"register_id" uuid NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_by" uuid NOT NULL,
	CONSTRAINT "point_of_sale_claims_number_register_key" UNIQUE("point_of_sale_number","register_id"),
	CONSTRAINT "point_of_sale_claims_number_in_range" CHECK ("point_of_sale_claims"."point_of_sale_number" between 1 and 99999)
);
--> statement-breakpoint
CREATE TABLE "register_points_of_sale" (
	"register_id" uuid PRIMARY KEY NOT NULL,
	"point_of_sale_number" integer NOT NULL,
	"fiscal_address_id" uuid NOT NULL,
	"version" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "point_of_sale_claims" ADD CONSTRAINT "point_of_sale_claims_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_of_sale_claims" ADD CONSTRAINT "point_of_sale_claims_claimed_by_users_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_points_of_sale" ADD CONSTRAINT "register_points_of_sale_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_points_of_sale" ADD CONSTRAINT "register_points_of_sale_fiscal_address_id_fiscal_addresses_id_fk" FOREIGN KEY ("fiscal_address_id") REFERENCES "public"."fiscal_addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_points_of_sale" ADD CONSTRAINT "register_points_of_sale_claim_fk" FOREIGN KEY ("point_of_sale_number","register_id") REFERENCES "public"."point_of_sale_claims"("point_of_sale_number","register_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_addresses_name_lower_key" ON "fiscal_addresses" USING btree (lower("name"));
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "point_of_sale_claims" FROM cloud_app;
