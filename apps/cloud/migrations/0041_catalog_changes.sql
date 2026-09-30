ALTER TYPE "public"."change_op" ADD VALUE 'delete';--> statement-breakpoint
ALTER TABLE "changes" ADD COLUMN "price_list_id" uuid;--> statement-breakpoint
ALTER TABLE "price_lists" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "changes_entity_price_list_id_idx" ON "changes" USING btree ("entity","price_list_id","change_seq");
--> statement-breakpoint
-- Everything already in the catalog before its changes were logged is logged once, so a register
-- pulling from the very first cursor receives it.
INSERT INTO "changes" ("entity", "entity_id", "version", "op")
SELECT 'category', "id", "version", 'insert' FROM "categories" ORDER BY "id";--> statement-breakpoint
INSERT INTO "changes" ("entity", "entity_id", "version", "op")
SELECT 'product', "id", "version", 'insert' FROM "products" ORDER BY "id";--> statement-breakpoint
INSERT INTO "changes" ("entity", "entity_id", "version", "op")
SELECT 'tag', "id", "version", 'insert' FROM "tags" ORDER BY "id";--> statement-breakpoint
INSERT INTO "changes" ("entity", "entity_id", "version", "op")
SELECT 'price_list', "id", "version", 'insert' FROM "price_lists" ORDER BY "id";--> statement-breakpoint
INSERT INTO "changes" ("entity", "entity_id", "version", "op", "price_list_id")
SELECT 'price', "id", 1, 'insert', "price_list_id" FROM "prices" ORDER BY "id";
