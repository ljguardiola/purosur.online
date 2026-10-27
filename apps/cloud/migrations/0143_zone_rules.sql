CREATE TABLE "zone_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"transitions" jsonb NOT NULL,
	"publication_number" integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "zone_rules_publication_number_key" ON "zone_rules" USING btree ("publication_number");
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "zone_rules" FROM cloud_app;
