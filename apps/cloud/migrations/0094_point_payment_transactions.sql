ALTER TABLE "payment_transactions" DROP CONSTRAINT "payment_transactions_method_check";--> statement-breakpoint
ALTER TABLE "payment_transactions" DROP CONSTRAINT "payment_transactions_provider_check";--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_method_provider_check" CHECK (("payment_transactions"."method" = 'QR' and "payment_transactions"."provider" = 'MERCADOPAGO_QR') or ("payment_transactions"."method" = 'POINT' and "payment_transactions"."provider" = 'MERCADOPAGO_POINT'));
