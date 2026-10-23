ALTER TABLE "supplier_price_lists" DROP CONSTRAINT "supplier_price_lists_source_kind_check";--> statement-breakpoint
ALTER TABLE "supplier_price_lists" ALTER COLUMN "file_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_price_lists" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "supplier_price_lists" ADD COLUMN "file_content_kind" text DEFAULT 'PDF' NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_price_lists" ALTER COLUMN "file_content_kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "supplier_price_lists" ADD CONSTRAINT "supplier_price_lists_file_content_kind_check" CHECK ("supplier_price_lists"."file_content_kind" in ('PDF', 'HTML'));--> statement-breakpoint
ALTER TABLE "supplier_price_lists" ADD CONSTRAINT "supplier_price_lists_source_check" CHECK (("supplier_price_lists"."source_kind" = 'PDF' and "supplier_price_lists"."file_name" is not null and "supplier_price_lists"."source_url" is null) or ("supplier_price_lists"."source_kind" = 'WEB_PAGE' and "supplier_price_lists"."source_url" is not null and "supplier_price_lists"."file_name" is null));--> statement-breakpoint
ALTER TABLE "supplier_price_lists" ADD CONSTRAINT "supplier_price_lists_source_kind_check" CHECK ("supplier_price_lists"."source_kind" in ('PDF', 'WEB_PAGE'));