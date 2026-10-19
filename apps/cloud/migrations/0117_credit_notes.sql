ALTER TABLE "orphan_credit_notes" RENAME TO "credit_notes";--> statement-breakpoint
ALTER TABLE "credit_notes" RENAME CONSTRAINT "orphan_credit_notes_pkey" TO "credit_notes_pkey";--> statement-breakpoint
ALTER TABLE "credit_notes" RENAME CONSTRAINT "orphan_credit_notes_register_id_registers_id_fk" TO "credit_notes_register_id_registers_id_fk";--> statement-breakpoint
ALTER TABLE "fiscal_tasks" RENAME CONSTRAINT "fiscal_tasks_credit_note_id_orphan_credit_notes_id_fk" TO "fiscal_tasks_credit_note_id_credit_notes_id_fk";--> statement-breakpoint
ALTER TABLE "credit_notes" RENAME CONSTRAINT "orphan_credit_notes_request_check" TO "credit_notes_request_check";--> statement-breakpoint
ALTER TABLE "credit_notes" RENAME CONSTRAINT "orphan_credit_notes_answer_kind_check" TO "credit_notes_answer_kind_check";--> statement-breakpoint
ALTER TABLE "credit_notes" RENAME CONSTRAINT "orphan_credit_notes_answer_request_check" TO "credit_notes_answer_request_check";--> statement-breakpoint
ALTER TABLE "credit_notes" RENAME CONSTRAINT "orphan_credit_notes_answer_time_check" TO "credit_notes_answer_time_check";--> statement-breakpoint
ALTER TABLE "credit_notes" RENAME CONSTRAINT "orphan_credit_notes_authorization_check" TO "credit_notes_authorization_check";--> statement-breakpoint
ALTER TABLE "credit_notes" RENAME CONSTRAINT "orphan_credit_notes_rejection_check" TO "credit_notes_rejection_check";--> statement-breakpoint
ALTER INDEX "orphan_credit_notes_number_key" RENAME TO "credit_notes_number_key";--> statement-breakpoint
DROP INDEX "orphan_credit_notes_orphan_key";--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "reason" text DEFAULT 'orphan' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ALTER COLUMN "reason" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "associated_point_of_sale" integer;--> statement-breakpoint
UPDATE "credit_notes" SET "associated_point_of_sale" = "point_of_sale";--> statement-breakpoint
ALTER TABLE "credit_notes" ALTER COLUMN "associated_point_of_sale" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ALTER COLUMN "kept_voucher_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ALTER COLUMN "kept_point_of_sale" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ALTER COLUMN "kept_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_reason_check" CHECK ("credit_notes"."reason" in ('orphan', 'sale_void'));--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_kept_voucher_check" CHECK (("credit_notes"."reason" = 'orphan') = ("credit_notes"."kept_voucher_type" is not null)
        and ("credit_notes"."kept_voucher_type" is null) = ("credit_notes"."kept_point_of_sale" is null)
        and ("credit_notes"."kept_voucher_type" is null) = ("credit_notes"."kept_number" is null));--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_corrected_voucher_key" ON "credit_notes" USING btree ("associated_voucher_type","associated_point_of_sale","associated_number");
