CREATE TABLE "zone_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"transitions" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "zone_rules_version_key" ON "zone_rules" USING btree ("version");
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "zone_rules" FROM cloud_app;
