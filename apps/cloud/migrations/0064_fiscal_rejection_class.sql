ALTER TABLE "fiscal_requests" ADD COLUMN "rejection_class" text;--> statement-breakpoint
ALTER TABLE "fiscal_requests" ADD CONSTRAINT "fiscal_requests_rejection_class_check" CHECK (coalesce("fiscal_requests"."answer_kind" = 'rejected', false) = ("fiscal_requests"."rejection_class" is not null)
        and "fiscal_requests"."rejection_class" in ('content', 'standing'));