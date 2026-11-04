ALTER TABLE "purchase_lines" DROP COLUMN "packaging_id";--> statement-breakpoint
ALTER TABLE "supplier_items" DROP COLUMN "packaging_id";--> statement-breakpoint
ALTER TABLE "supplier_price_list_rows" DROP COLUMN "packaging_id";--> statement-breakpoint
DROP TABLE "product_packagings";
