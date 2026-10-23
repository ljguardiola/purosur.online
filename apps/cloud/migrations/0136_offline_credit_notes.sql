ALTER TABLE "offline_fiscal_documents" DROP CONSTRAINT "offline_fiscal_documents_sale_id_unique";--> statement-breakpoint
ALTER TABLE "fortnight_document_reports" DROP CONSTRAINT "fortnight_document_reports_document_type_known";--> statement-breakpoint
ALTER TABLE "offline_fiscal_documents" DROP CONSTRAINT "offline_fiscal_documents_document_type_known";--> statement-breakpoint
ALTER TABLE "offline_number_blocks" DROP CONSTRAINT "offline_number_blocks_document_type_known";--> statement-breakpoint
ALTER TABLE "offline_fiscal_documents" ADD COLUMN "credit_note_id" uuid;--> statement-breakpoint
ALTER TABLE "offline_fiscal_documents" ADD COLUMN "corrected_voucher_type" integer;--> statement-breakpoint
ALTER TABLE "offline_fiscal_documents" ADD COLUMN "corrected_point_of_sale" integer;--> statement-breakpoint
ALTER TABLE "offline_fiscal_documents" ADD COLUMN "corrected_number" integer;--> statement-breakpoint
CREATE INDEX "offline_fiscal_documents_corrected_voucher_idx" ON "offline_fiscal_documents" USING btree ("corrected_voucher_type","corrected_point_of_sale","corrected_number") WHERE "offline_fiscal_documents"."document_type" = 'credit_note_c';--> statement-breakpoint
ALTER TABLE "offline_fiscal_documents" ADD CONSTRAINT "offline_fiscal_documents_sale_document_key" UNIQUE("sale_id","document_type");--> statement-breakpoint
ALTER TABLE "fortnight_document_reports" ADD CONSTRAINT "fortnight_document_reports_document_type_known" CHECK ("fortnight_document_reports"."document_type" in ('factura_c', 'credit_note_c'));--> statement-breakpoint
ALTER TABLE "offline_fiscal_documents" ADD CONSTRAINT "offline_fiscal_documents_credit_note_data" CHECK (("offline_fiscal_documents"."document_type" = 'credit_note_c') = ("offline_fiscal_documents"."credit_note_id" is not null)
        and ("offline_fiscal_documents"."credit_note_id" is null) = ("offline_fiscal_documents"."corrected_voucher_type" is null)
        and ("offline_fiscal_documents"."credit_note_id" is null) = ("offline_fiscal_documents"."corrected_point_of_sale" is null)
        and ("offline_fiscal_documents"."credit_note_id" is null) = ("offline_fiscal_documents"."corrected_number" is null));--> statement-breakpoint
ALTER TABLE "offline_fiscal_documents" ADD CONSTRAINT "offline_fiscal_documents_document_type_known" CHECK ("offline_fiscal_documents"."document_type" in ('factura_c', 'credit_note_c'));--> statement-breakpoint
ALTER TABLE "offline_number_blocks" ADD CONSTRAINT "offline_number_blocks_document_type_known" CHECK ("offline_number_blocks"."document_type" in ('factura_c', 'credit_note_c'));--> statement-breakpoint
ALTER TYPE "public"."document_type_report_state" ADD VALUE 'awaiting_invoice_report';--> statement-breakpoint
ALTER TYPE "public"."fortnight_report_state" ADD VALUE 'awaiting_invoice_report';--> statement-breakpoint
ALTER TABLE "tax_authority_last_authorized_numbers" DROP CONSTRAINT "tax_authority_last_authorized_numbers_pkey";--> statement-breakpoint
ALTER TABLE "tax_authority_last_authorized_numbers" ADD COLUMN "document_type" text DEFAULT 'factura_c' NOT NULL;--> statement-breakpoint
ALTER TABLE "tax_authority_last_authorized_numbers" ALTER COLUMN "document_type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tax_authority_last_authorized_numbers" ADD CONSTRAINT "tax_authority_last_authorized_numbers_pkey" PRIMARY KEY("point_of_sale_number","document_type");--> statement-breakpoint
ALTER TABLE "tax_authority_last_authorized_numbers" ADD CONSTRAINT "tax_authority_last_authorized_numbers_document_type_known" CHECK ("tax_authority_last_authorized_numbers"."document_type" in ('factura_c', 'credit_note_c'));