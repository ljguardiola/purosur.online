ALTER TABLE "payment_refunds" DROP CONSTRAINT "payment_refunds_origin_check";--> statement-breakpoint
ALTER TABLE "payment_refunds" DROP CONSTRAINT "payment_refunds_source_check";--> statement-breakpoint
ALTER TABLE "sales" DROP CONSTRAINT "sales_state_check";--> statement-breakpoint
ALTER TABLE "sales" DROP CONSTRAINT "sales_state_matches_timestamps_check";--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_kind_check";--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_reason_unless_count_sale_or_receipt_check";--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_sale_line_iff_sale_check";--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "void_authorized_by" text;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_origin_check" CHECK ("payment_refunds"."origin" in ('sale_cancelled', 'late_payment', 'sale_voided'));--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_source_check" CHECK (("payment_refunds"."origin" = 'late_payment' and "payment_refunds"."payment_id" is null and "payment_refunds"."payment_transaction_id" is not null and "payment_refunds"."origin_event_id" is null) or ("payment_refunds"."origin" in ('sale_cancelled', 'sale_voided') and "payment_refunds"."payment_id" is not null));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_void_authorizer_only_when_voided_check" CHECK ("sales"."void_authorized_by" is null or "sales"."state" = 'VOIDED');--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_state_check" CHECK ("sales"."state" in ('COMPLETED', 'CANCELLED', 'VOIDED'));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_state_matches_timestamps_check" CHECK (("sales"."state" = 'COMPLETED' and "sales"."completed_at" is not null and "sales"."cancelled_at" is null and "sales"."voided_at" is null)
      or ("sales"."state" = 'CANCELLED' and "sales"."cancelled_at" is not null and "sales"."completed_at" is null and "sales"."voided_at" is null)
      or ("sales"."state" = 'VOIDED' and "sales"."completed_at" is not null and "sales"."voided_at" is not null and "sales"."cancelled_at" is null));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_kind_check" CHECK ("stock_movements"."kind" in ('loss', 'adjustment', 'count', 'sale', 'sale_void', 'receipt', 'opening_count', 'opening_count_withdrawal', 'assembly_out', 'assembly_in'));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reason_unless_count_sale_or_receipt_check" CHECK (("stock_movements"."kind" in ('count', 'sale', 'sale_void', 'receipt', 'opening_count', 'opening_count_withdrawal', 'assembly_out', 'assembly_in')) = ("stock_movements"."reason" is null));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_line_iff_sale_check" CHECK (("stock_movements"."kind" in ('sale', 'sale_void')) = ("stock_movements"."sale_line_id" is not null));
--> statement-breakpoint
GRANT UPDATE ("state", "voided_at", "void_authorized_by") ON "sales" TO cloud_app;
