CREATE TABLE "price_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"price_list_id" uuid NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid NOT NULL,
	"price_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"price_list_id" uuid NOT NULL,
	"unit_price" integer NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prices_id_product_id_price_list_id_key" UNIQUE("id","product_id","price_list_id"),
	CONSTRAINT "prices_unit_price_positive" CHECK ("prices"."unit_price" > 0)
);
--> statement-breakpoint
INSERT INTO "price_lists" ("name") VALUES ('Lista general');
--> statement-breakpoint
ALTER TABLE "branch_settings" ADD COLUMN "price_list_id" uuid;
--> statement-breakpoint
UPDATE "branch_settings" SET "price_list_id" = (SELECT "id" FROM "price_lists" LIMIT 1);
--> statement-breakpoint
ALTER TABLE "branch_settings" ALTER COLUMN "price_list_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "price_reviews" ADD CONSTRAINT "price_reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_reviews" ADD CONSTRAINT "price_reviews_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_reviews" ADD CONSTRAINT "price_reviews_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_reviews" ADD CONSTRAINT "price_reviews_price_product_price_list_fk" FOREIGN KEY ("price_id","product_id","price_list_id") REFERENCES "public"."prices"("id","product_id","price_list_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_reviews_product_id_price_list_id_reviewed_at_idx" ON "price_reviews" USING btree ("product_id","price_list_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "prices_product_id_price_list_id_valid_from_idx" ON "prices" USING btree ("product_id","price_list_id","valid_from");--> statement-breakpoint
ALTER TABLE "branch_settings" ADD CONSTRAINT "branch_settings_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Append-only, the same way migration 0016 makes audit_log append-only: cloud_app can insert and
-- read a price or a price review, but the database itself refuses to rewrite or erase one, even
-- from application code, so the full price and review history is never lost.
REVOKE UPDATE, DELETE, TRUNCATE ON "prices" FROM cloud_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "price_reviews" FROM cloud_app;
