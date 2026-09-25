DROP INDEX "categories_name_lower_key";--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_parent_id_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
-- NULLS NOT DISTINCT (schema.ts's comment on `categories`): drizzle-kit's generator doesn't add
-- it for an index (only for a `unique()` table constraint, which can't take `lower(name)`), so
-- this clause is hand-added below the generated statement, the same way 0026's trigger is.
CREATE UNIQUE INDEX "categories_name_lower_key" ON "categories" USING btree ("parent_id",lower("name")) NULLS NOT DISTINCT;