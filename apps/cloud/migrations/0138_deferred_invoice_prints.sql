ALTER TABLE "sale_reprints" DROP CONSTRAINT "sale_reprints_document_check";--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "deferred_invoice_print_attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "deferred_invoice_printed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sale_reprints" ADD CONSTRAINT "sale_reprints_document_check" CHECK ("sale_reprints"."document" in ('sale_receipt', 'credit_note', 'deferred_invoice'));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_deferred_invoice_printed_only_after_attempted_check" CHECK ("sales"."deferred_invoice_printed_at" is null or "sales"."deferred_invoice_print_attempted_at" is not null);--> statement-breakpoint
-- Like the receipt's, the deferred invoice's print state moves forward as later events arrive.
GRANT UPDATE ("deferred_invoice_print_attempted_at", "deferred_invoice_printed_at") ON "sales" TO cloud_app;
