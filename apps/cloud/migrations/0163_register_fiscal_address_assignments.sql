CREATE TABLE "register_fiscal_address_assignments" (
	"register_id" uuid NOT NULL,
	"fiscal_address_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone NOT NULL,
	CONSTRAINT "register_fiscal_address_assignments_pkey" PRIMARY KEY("register_id","assigned_at")
);
--> statement-breakpoint
ALTER TABLE "register_fiscal_address_assignments" ADD CONSTRAINT "register_fiscal_address_assignments_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_fiscal_address_assignments" ADD CONSTRAINT "register_fiscal_address_assignments_fiscal_address_id_fiscal_addresses_id_fk" FOREIGN KEY ("fiscal_address_id") REFERENCES "public"."fiscal_addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Each register held its current fiscal address since before any voucher it issued: no earlier
-- assignment was ever recorded.
INSERT INTO "register_fiscal_address_assignments" ("register_id", "fiscal_address_id", "assigned_at")
SELECT "register_id", "fiscal_address_id", '-infinity'::timestamptz FROM "register_points_of_sale";
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "register_fiscal_address_assignments" FROM cloud_app;
