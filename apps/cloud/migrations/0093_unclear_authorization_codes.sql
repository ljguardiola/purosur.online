ALTER TABLE "fiscal_requests" ADD COLUMN "unclear_codes" integer[];--> statement-breakpoint
UPDATE "fiscal_requests" SET "unclear_codes" = '{}' WHERE "answer_kind" = 'unclear';--> statement-breakpoint
ALTER TABLE "fiscal_requests" ADD CONSTRAINT "fiscal_requests_unclear_codes_check" CHECK (coalesce("fiscal_requests"."answer_kind" = 'unclear', false) = ("fiscal_requests"."unclear_codes" is not null));
