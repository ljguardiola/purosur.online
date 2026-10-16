CREATE TABLE "fiscal_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"register_id" uuid NOT NULL,
	"point_of_sale" integer NOT NULL,
	"document_type" text NOT NULL,
	"number" integer NOT NULL,
	"credit_note_id" uuid,
	"reason" jsonb NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "fiscal_tasks_kind_check" CHECK ("fiscal_tasks"."kind" in ('external_invoicing', 'credit_note_rejected')),
	CONSTRAINT "fiscal_tasks_credit_note_check" CHECK (("fiscal_tasks"."kind" = 'credit_note_rejected') = ("fiscal_tasks"."credit_note_id" is not null)),
	CONSTRAINT "fiscal_tasks_document_type_check" CHECK ("fiscal_tasks"."document_type" in ('factura_c', 'credit_note_c')),
	CONSTRAINT "fiscal_tasks_state_check" CHECK ("fiscal_tasks"."state" in ('open', 'closed')),
	CONSTRAINT "fiscal_tasks_closed_time_check" CHECK (("fiscal_tasks"."state" = 'closed') = ("fiscal_tasks"."closed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "orphan_credit_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"register_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"point_of_sale" integer NOT NULL,
	"associated_voucher_type" integer NOT NULL,
	"associated_number" integer NOT NULL,
	"kept_voucher_type" integer NOT NULL,
	"kept_point_of_sale" integer NOT NULL,
	"kept_number" integer NOT NULL,
	"total" bigint NOT NULL,
	"receiver_tax_status_code" integer NOT NULL,
	"number" integer,
	"issued_on" date,
	"requested_at" timestamp with time zone,
	"answer_kind" text,
	"answered_at" timestamp with time zone,
	"authorization_code" text,
	"authorization_code_due_on" date,
	"rejections" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "orphan_credit_notes_request_check" CHECK (("orphan_credit_notes"."number" is null) = ("orphan_credit_notes"."issued_on" is null)
        and ("orphan_credit_notes"."number" is null) = ("orphan_credit_notes"."requested_at" is null)),
	CONSTRAINT "orphan_credit_notes_answer_kind_check" CHECK ("orphan_credit_notes"."answer_kind" in ('authorized', 'rejected', 'unclear')),
	CONSTRAINT "orphan_credit_notes_answer_request_check" CHECK ("orphan_credit_notes"."answer_kind" is null or "orphan_credit_notes"."number" is not null),
	CONSTRAINT "orphan_credit_notes_answer_time_check" CHECK (("orphan_credit_notes"."answer_kind" is null) = ("orphan_credit_notes"."answered_at" is null)),
	CONSTRAINT "orphan_credit_notes_authorization_check" CHECK (coalesce("orphan_credit_notes"."answer_kind" = 'authorized', false) = ("orphan_credit_notes"."authorization_code" is not null)
        and ("orphan_credit_notes"."authorization_code" is null) = ("orphan_credit_notes"."authorization_code_due_on" is null)),
	CONSTRAINT "orphan_credit_notes_rejection_check" CHECK (coalesce("orphan_credit_notes"."answer_kind" = 'rejected', false) = ("orphan_credit_notes"."rejections" is not null))
);
--> statement-breakpoint
ALTER TABLE "fiscal_tasks" ADD CONSTRAINT "fiscal_tasks_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_tasks" ADD CONSTRAINT "fiscal_tasks_credit_note_id_orphan_credit_notes_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."orphan_credit_notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orphan_credit_notes" ADD CONSTRAINT "orphan_credit_notes_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_tasks_voucher_key" ON "fiscal_tasks" USING btree ("point_of_sale","document_type","number") WHERE "fiscal_tasks"."kind" = 'external_invoicing';--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_tasks_credit_note_key" ON "fiscal_tasks" USING btree ("credit_note_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orphan_credit_notes_orphan_key" ON "orphan_credit_notes" USING btree ("point_of_sale","associated_voucher_type","associated_number");--> statement-breakpoint
CREATE UNIQUE INDEX "orphan_credit_notes_number_key" ON "orphan_credit_notes" USING btree ("point_of_sale","number") WHERE "orphan_credit_notes"."number" is not null and "orphan_credit_notes"."answer_kind" is distinct from 'rejected';