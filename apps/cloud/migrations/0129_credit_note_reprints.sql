ALTER TABLE "sale_reprints" ADD COLUMN "document" text DEFAULT 'sale_receipt' NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_reprints" DROP CONSTRAINT "sale_reprints_sale_id_order_number_pk";--> statement-breakpoint
ALTER TABLE "sale_reprints" ADD CONSTRAINT "sale_reprints_sale_id_document_order_number_pk" PRIMARY KEY("sale_id","document","order_number");--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "credit_note_print_attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "credit_note_printed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sale_reprints" ADD CONSTRAINT "sale_reprints_document_check" CHECK ("sale_reprints"."document" in ('sale_receipt', 'credit_note'));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_credit_note_printed_only_after_attempted_check" CHECK ("sales"."credit_note_printed_at" is null or "sales"."credit_note_print_attempted_at" is not null);--> statement-breakpoint
-- Like the receipt's, the credit note's print state moves forward as later events arrive.
GRANT UPDATE ("credit_note_print_attempted_at", "credit_note_printed_at") ON "sales" TO cloud_app;
