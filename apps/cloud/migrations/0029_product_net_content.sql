ALTER TABLE "products" ADD COLUMN "net_content_quantity" numeric(10, 3);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "net_content_unit" text;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_net_content_unit_check" CHECK ("products"."net_content_unit" in ('G', 'KG', 'ML', 'L', 'UNIT'));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_net_content_both_or_neither_check" CHECK (("products"."net_content_quantity" is null) = ("products"."net_content_unit" is null));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_net_content_quantity_positive_check" CHECK ("products"."net_content_quantity" > 0);