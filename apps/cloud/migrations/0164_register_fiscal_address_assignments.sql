CREATE TABLE "register_fiscal_address_assignments" (
	"register_id" uuid NOT NULL,
	"fiscal_address_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone NOT NULL,
	CONSTRAINT "register_fiscal_address_assignments_pkey" PRIMARY KEY("register_id","assigned_at")
);
--> statement-breakpoint
ALTER TABLE "register_fiscal_address_assignments" ADD CONSTRAINT "register_fiscal_address_assignments_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_fiscal_address_assignments" ADD CONSTRAINT "register_fiscal_address_assignments_fiscal_address_id_fiscal_addresses_id_fk" FOREIGN KEY ("fiscal_address_id") REFERENCES "public"."fiscal_addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- No voucher precedes a register's first configuration, so its earliest assignment holds since
-- -infinity, which also covers vouchers whose instant falls slightly before the audited one.
INSERT INTO "register_fiscal_address_assignments" ("register_id", "fiscal_address_id", "assigned_at")
WITH "changes" AS (
	SELECT DISTINCT ON ("entity_id", "at")
		"entity_id" AS "register_id",
		("new_value"->>'fiscal_address_id')::uuid AS "fiscal_address_id",
		"at"
	FROM "audit_log"
	WHERE "entity" = 'register_point_of_sale'
		AND ("previous_value" IS NULL
			OR "previous_value"->>'fiscal_address_id' IS DISTINCT FROM "new_value"->>'fiscal_address_id')
	ORDER BY "entity_id", "at", ("new_value"->>'version')::int DESC
),
"audited" AS (
	SELECT "register_id", "fiscal_address_id",
		CASE WHEN row_number() OVER (PARTITION BY "register_id" ORDER BY "at") = 1
			THEN '-infinity'::timestamptz ELSE "at" END AS "assigned_at"
	FROM "changes"
)
SELECT "register_id", "fiscal_address_id", "assigned_at" FROM "audited"
UNION ALL
SELECT "register_id", "fiscal_address_id", '-infinity'::timestamptz
FROM "register_points_of_sale"
WHERE "register_id" NOT IN (SELECT "register_id" FROM "changes");
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "register_fiscal_address_assignments" FROM cloud_app;
