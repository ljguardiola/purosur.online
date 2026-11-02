DROP TRIGGER "supplier_items_link_quantity_from_packaging" ON "supplier_items";--> statement-breakpoint
DROP TRIGGER "supplier_price_list_rows_link_quantity_from_packaging" ON "supplier_price_list_rows";--> statement-breakpoint
DROP FUNCTION "link_quantity_from_packaging"();--> statement-breakpoint
ALTER TABLE "purchase_lines" DROP CONSTRAINT "purchase_lines_packaging_needs_packages_check";--> statement-breakpoint
ALTER TABLE "purchase_lines" DROP CONSTRAINT "purchase_lines_packaging_id_product_packagings_id_fk";--> statement-breakpoint
ALTER TABLE "supplier_items" DROP CONSTRAINT "supplier_items_packaging_id_product_packagings_id_fk";--> statement-breakpoint
ALTER TABLE "supplier_price_list_rows" DROP CONSTRAINT "supplier_price_list_rows_packaging_id_product_packagings_id_fk";--> statement-breakpoint
DELETE FROM "role_permissions" WHERE "permission_key" = 'manage_purchase_presentations';
