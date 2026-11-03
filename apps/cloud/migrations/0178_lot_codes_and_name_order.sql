CREATE SEQUENCE "public"."lot_code_sequence" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."lot_name_order_sequence" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "code" bigint;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "name_order" bigint;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "name_number" integer;--> statement-breakpoint
UPDATE "lots" SET "code" = "numbered"."position", "name_order" = "numbered"."position" FROM (SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS "position" FROM "lots") AS "numbered" WHERE "lots"."id" = "numbered"."id";--> statement-breakpoint
SELECT setval('lot_code_sequence', coalesce(max("code"), 1), max("code") IS NOT NULL) FROM "lots";--> statement-breakpoint
SELECT setval('lot_name_order_sequence', coalesce(max("name_order"), 1), max("name_order") IS NOT NULL) FROM "lots";--> statement-breakpoint
ALTER TABLE "lots" ALTER COLUMN "code" SET DEFAULT nextval('lot_code_sequence');--> statement-breakpoint
ALTER TABLE "lots" ALTER COLUMN "name_order" SET DEFAULT nextval('lot_name_order_sequence');--> statement-breakpoint
ALTER TABLE "lots" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ALTER COLUMN "name_order" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_code_key" UNIQUE("code");
