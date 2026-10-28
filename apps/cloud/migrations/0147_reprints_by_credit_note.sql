ALTER TABLE "sale_reprints" DROP CONSTRAINT "sale_reprints_sale_id_document_order_number_pk";--> statement-breakpoint
ALTER TABLE "sale_reprints" ADD COLUMN "credit_note_id" uuid;--> statement-breakpoint
ALTER TABLE "sale_reprints" ADD CONSTRAINT "sale_reprints_once_per_order" UNIQUE NULLS NOT DISTINCT("sale_id","document","credit_note_id","order_number");--> statement-breakpoint
ALTER TABLE "sale_reprints" ADD CONSTRAINT "sale_reprints_credit_note_id_only_for_credit_note_check" CHECK ("sale_reprints"."credit_note_id" is null or "sale_reprints"."document" = 'credit_note');