ALTER TABLE "sale_reprints" DROP CONSTRAINT "sale_reprints_sale_id_document_order_number_pk";--> statement-breakpoint
ALTER TABLE "sale_reprints" ADD COLUMN "credit_note_id" uuid;--> statement-breakpoint
UPDATE "sale_reprints" SET "credit_note_id" = coalesce(
  (SELECT "credit_notes"."id" FROM "credit_notes"
    WHERE "credit_notes"."sale_id" = "sale_reprints"."sale_id" AND "credit_notes"."reason" = 'sale_void'),
  (SELECT "offline_fiscal_documents"."credit_note_id" FROM "offline_fiscal_documents"
    WHERE "offline_fiscal_documents"."sale_id" = "sale_reprints"."sale_id"
      AND "offline_fiscal_documents"."document_type" = 'credit_note_c')
) WHERE "sale_reprints"."document" = 'credit_note';--> statement-breakpoint
ALTER TABLE "sale_reprints" ADD CONSTRAINT "sale_reprints_once_per_order" UNIQUE NULLS NOT DISTINCT("sale_id","document","credit_note_id","order_number");--> statement-breakpoint
ALTER TABLE "sale_reprints" ADD CONSTRAINT "sale_reprints_credit_note_id_check" CHECK (("sale_reprints"."document" = 'credit_note') = ("sale_reprints"."credit_note_id" is not null));