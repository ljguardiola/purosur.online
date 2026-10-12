ALTER TABLE "sale_lines" ADD COLUMN "sale_discount_share" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "sale_discount_kind" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "sale_discount_value" bigint;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "sale_discount_amount" bigint;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "sale_discount_reason" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "sale_discount_authorized_by" text;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_discount_share_check" CHECK ("sale_lines"."sale_discount_share" >= 0);--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_sale_discount_kind_check" CHECK ("sales"."sale_discount_kind" IN ('PERCENT', 'AMOUNT'));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_sale_discount_value_check" CHECK (("sales"."sale_discount_value" IS NULL) = ("sales"."sale_discount_kind" IS NULL)
        AND (
          "sales"."sale_discount_kind" IS NULL
          OR ("sales"."sale_discount_kind" = 'PERCENT' AND "sales"."sale_discount_value" BETWEEN 1 AND 100)
          OR ("sales"."sale_discount_kind" = 'AMOUNT' AND "sales"."sale_discount_value" > 0)
        ));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_sale_discount_amount_check" CHECK (("sales"."sale_discount_amount" IS NULL) = ("sales"."sale_discount_kind" IS NULL)
        AND ("sales"."sale_discount_amount" IS NULL OR "sales"."sale_discount_amount" >= 0));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_sale_discount_reason_check" CHECK (("sales"."sale_discount_reason" IS NULL) = ("sales"."sale_discount_kind" IS NULL)
        AND ("sales"."sale_discount_reason" IS NULL OR btrim("sales"."sale_discount_reason") <> ''));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_sale_discount_authorized_by_check" CHECK ("sales"."sale_discount_authorized_by" IS NULL OR "sales"."sale_discount_kind" IS NOT NULL);