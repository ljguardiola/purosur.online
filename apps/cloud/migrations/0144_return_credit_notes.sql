ALTER TABLE "credit_notes" DROP CONSTRAINT "credit_notes_reason_check";--> statement-breakpoint
ALTER TABLE "credit_notes" DROP CONSTRAINT "credit_notes_answer_kind_check";--> statement-breakpoint
ALTER TABLE "credit_notes" DROP CONSTRAINT "credit_notes_answer_request_check";--> statement-breakpoint
ALTER TABLE "fiscal_tasks" DROP CONSTRAINT "fiscal_tasks_voucher_check";--> statement-breakpoint
DROP INDEX "credit_notes_corrected_voucher_key";--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "return_id" uuid;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "issue_on" date;--> statement-breakpoint
CREATE INDEX "credit_notes_corrected_voucher_idx" ON "credit_notes" USING btree ("associated_voucher_type","associated_point_of_sale","associated_number");--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_return_check" CHECK (("credit_notes"."reason" = 'sale_return') = ("credit_notes"."return_id" is not null)
        and ("credit_notes"."return_id" is null) = ("credit_notes"."issue_on" is null));--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_reason_check" CHECK ("credit_notes"."reason" in ('orphan', 'sale_void', 'sale_return', 'rejected_document'));--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_answer_kind_check" CHECK ("credit_notes"."answer_kind" in ('authorized', 'rejected', 'unclear', 'regularization_required'));--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_answer_request_check" CHECK ("credit_notes"."answer_kind" is null or "credit_notes"."answer_kind" = 'regularization_required' or "credit_notes"."number" is not null);--> statement-breakpoint
ALTER TABLE "fiscal_tasks" ADD CONSTRAINT "fiscal_tasks_voucher_check" CHECK (("fiscal_tasks"."kind" = 'deferred_sale_expired' and "fiscal_tasks"."point_of_sale" is null and "fiscal_tasks"."document_type" is null and "fiscal_tasks"."number" is null) or ("fiscal_tasks"."kind" <> 'deferred_sale_expired' and "fiscal_tasks"."point_of_sale" is not null and "fiscal_tasks"."document_type" is not null and ("fiscal_tasks"."number" is not null or "fiscal_tasks"."kind" = 'credit_note_rejected')));