ALTER TABLE "discounts" DROP CONSTRAINT "discounts_kind_check";--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "buy_qty" integer;--> statement-breakpoint
ALTER TABLE "discounts" ADD COLUMN "pay_qty" integer;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_buy_n_pay_m_quantities_check" CHECK ("discounts"."kind" <> 'BUY_N_PAY_M' or coalesce("discounts"."pay_qty" >= 1 and "discounts"."buy_qty" > "discounts"."pay_qty", false));--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_percent_off_has_no_quantities_check" CHECK ("discounts"."kind" <> 'PERCENT_OFF' or ("discounts"."buy_qty" is null and "discounts"."pay_qty" is null));--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_buy_n_pay_m_has_no_percent_check" CHECK ("discounts"."kind" <> 'BUY_N_PAY_M' or "discounts"."percent" is null);--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_buy_n_pay_m_product_check" CHECK ("discounts"."kind" <> 'BUY_N_PAY_M' or "discounts"."product_id" is not null);--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_kind_check" CHECK ("discounts"."kind" in ('PERCENT_OFF', 'BUY_N_PAY_M'));