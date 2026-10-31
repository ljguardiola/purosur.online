ALTER TABLE "supplier_items" DROP CONSTRAINT "supplier_items_link_check";--> statement-breakpoint
ALTER TABLE "supplier_price_list_rows" DROP CONSTRAINT "supplier_price_list_rows_link_check";--> statement-breakpoint
ALTER TABLE "supplier_items" ADD COLUMN "quantity" bigint;--> statement-breakpoint
ALTER TABLE "supplier_items" ADD COLUMN "sale_unit" text;--> statement-breakpoint
ALTER TABLE "supplier_items" ADD COLUMN "relink_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_price_list_rows" ADD COLUMN "quantity" bigint;--> statement-breakpoint
ALTER TABLE "supplier_price_list_rows" ADD COLUMN "sale_unit" text;--> statement-breakpoint
ALTER TABLE "supplier_price_list_rows" ADD COLUMN "relink_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "supplier_items" AS "item"
SET "quantity" = "packaging"."quantity_per_package", "sale_unit" = "packaging"."sale_unit", "relink_required" = NOT "packaging"."active"
FROM "product_packagings" AS "packaging"
WHERE "item"."packaging_id" = "packaging"."id";--> statement-breakpoint
UPDATE "supplier_price_list_rows" AS "row"
SET "quantity" = "packaging"."quantity_per_package", "sale_unit" = "packaging"."sale_unit", "relink_required" = NOT "packaging"."active"
FROM "product_packagings" AS "packaging"
WHERE "row"."packaging_id" = "packaging"."id";--> statement-breakpoint
ALTER TABLE "supplier_items" ADD CONSTRAINT "supplier_items_link_sale_unit_check" CHECK (("supplier_items"."quantity" is null) = ("supplier_items"."sale_unit" is null) and "supplier_items"."sale_unit" in ('UNIT', 'KG'));--> statement-breakpoint
ALTER TABLE "supplier_items" ADD CONSTRAINT "supplier_items_link_quantity_check" CHECK ("supplier_items"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "supplier_items" ADD CONSTRAINT "supplier_items_link_check" CHECK (("supplier_items"."product_id" is null) = ("supplier_items"."quantity" is null));--> statement-breakpoint
ALTER TABLE "supplier_price_list_rows" ADD CONSTRAINT "supplier_price_list_rows_link_sale_unit_check" CHECK (("supplier_price_list_rows"."quantity" is null) = ("supplier_price_list_rows"."sale_unit" is null) and "supplier_price_list_rows"."sale_unit" in ('UNIT', 'KG'));--> statement-breakpoint
ALTER TABLE "supplier_price_list_rows" ADD CONSTRAINT "supplier_price_list_rows_link_quantity_check" CHECK ("supplier_price_list_rows"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "supplier_price_list_rows" ADD CONSTRAINT "supplier_price_list_rows_link_check" CHECK (("supplier_price_list_rows"."product_id" is null) = ("supplier_price_list_rows"."quantity" is null));--> statement-breakpoint
CREATE FUNCTION "link_quantity_from_packaging"() RETURNS trigger AS $$
BEGIN
  IF NEW.packaging_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.packaging_id IS DISTINCT FROM OLD.packaging_id) THEN
    SELECT "quantity_per_package", "sale_unit", NOT "active"
    INTO NEW.quantity, NEW.sale_unit, NEW.relink_required
    FROM "product_packagings" WHERE "id" = NEW.packaging_id;
  ELSIF NEW.product_id IS NULL THEN
    NEW.quantity := NULL;
    NEW.sale_unit := NULL;
    NEW.relink_required := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "supplier_items_link_quantity_from_packaging" BEFORE INSERT OR UPDATE ON "supplier_items" FOR EACH ROW EXECUTE FUNCTION "link_quantity_from_packaging"();--> statement-breakpoint
CREATE TRIGGER "supplier_price_list_rows_link_quantity_from_packaging" BEFORE INSERT OR UPDATE ON "supplier_price_list_rows" FOR EACH ROW EXECUTE FUNCTION "link_quantity_from_packaging"();
