ALTER TYPE "public"."installation_request_endpoint" ADD VALUE 'fiscal_unclear_outcome';--> statement-breakpoint
ALTER TABLE "fiscal_requests" ADD COLUMN "decision" text;--> statement-breakpoint
ALTER TABLE "fiscal_requests" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fiscal_requests" ADD COLUMN "adopted_authorization_code" text;--> statement-breakpoint
ALTER TABLE "fiscal_requests" ADD COLUMN "adopted_authorization_code_due_on" date;--> statement-breakpoint
ALTER TABLE "fiscal_requests" ADD CONSTRAINT "fiscal_requests_decision_check" CHECK ("fiscal_requests"."decision" in ('released', 'adopted', 'conflicting'));--> statement-breakpoint
ALTER TABLE "fiscal_requests" ADD CONSTRAINT "fiscal_requests_decision_time_check" CHECK (("fiscal_requests"."decision" is null) = ("fiscal_requests"."decided_at" is null));--> statement-breakpoint
ALTER TABLE "fiscal_requests" ADD CONSTRAINT "fiscal_requests_adoption_check" CHECK (coalesce("fiscal_requests"."decision" = 'adopted', false) = ("fiscal_requests"."adopted_authorization_code" is not null)
        and ("fiscal_requests"."adopted_authorization_code" is null) = ("fiscal_requests"."adopted_authorization_code_due_on" is null));--> statement-breakpoint
ALTER TABLE "fiscal_requests" ADD CONSTRAINT "fiscal_requests_decision_answer_check" CHECK ("fiscal_requests"."decision" is null or coalesce("fiscal_requests"."answer_kind" in ('unclear', 'not_attempted'), false));