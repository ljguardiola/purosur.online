ALTER TABLE "sale_lines" ADD COLUMN "manual_adjustment_kind" text;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD COLUMN "manual_adjustment_value" bigint;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD COLUMN "manual_adjustment_reason" text;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD COLUMN "manual_adjustment_authorized_by" text;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_manual_adjustment_kind_check" CHECK ("sale_lines"."manual_adjustment_kind" IN ('PRICE', 'PERCENT', 'AMOUNT'));--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_manual_adjustment_value_check" CHECK (("sale_lines"."manual_adjustment_value" IS NULL) = ("sale_lines"."manual_adjustment_kind" IS NULL)
        AND (
          "sale_lines"."manual_adjustment_kind" IS NULL
          OR ("sale_lines"."manual_adjustment_kind" = 'PRICE' AND "sale_lines"."manual_adjustment_value" >= 0)
          OR ("sale_lines"."manual_adjustment_kind" = 'PERCENT' AND "sale_lines"."manual_adjustment_value" BETWEEN 1 AND 100)
          OR ("sale_lines"."manual_adjustment_kind" = 'AMOUNT' AND "sale_lines"."manual_adjustment_value" > 0)
        ));--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_manual_adjustment_reason_check" CHECK (("sale_lines"."manual_adjustment_reason" IS NULL) = ("sale_lines"."manual_adjustment_kind" IS NULL)
        AND ("sale_lines"."manual_adjustment_reason" IS NULL OR btrim("sale_lines"."manual_adjustment_reason") <> ''));--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_manual_adjustment_authorized_by_check" CHECK ("sale_lines"."manual_adjustment_authorized_by" IS NULL OR "sale_lines"."manual_adjustment_kind" IS NOT NULL);