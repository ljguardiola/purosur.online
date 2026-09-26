DROP INDEX "product_barcodes_code_key";--> statement-breakpoint
ALTER TABLE "product_barcodes" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_barcodes_code_key" ON "product_barcodes" USING btree ("code") WHERE "product_barcodes"."active" = true;--> statement-breakpoint
-- drizzle-kit has no declarative trigger support, so "products are never deleted, only
-- deactivated" is enforced here as a plain trigger instead of a schema.ts construct.
CREATE FUNCTION reject_product_deletion() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'products are never deleted, only deactivated';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER products_reject_deletion
BEFORE DELETE ON "products"
FOR EACH ROW EXECUTE FUNCTION reject_product_deletion();