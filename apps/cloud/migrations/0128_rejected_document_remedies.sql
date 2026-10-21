CREATE TABLE "rejected_document_remedies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"point_of_sale_number" integer NOT NULL,
	"fortnight_start" date NOT NULL,
	"document_type" text NOT NULL,
	"number" integer NOT NULL,
	"kind" text NOT NULL,
	"correction" jsonb,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rejected_document_remedies_kind_check" CHECK ("rejected_document_remedies"."kind" in ('report', 'printed')),
	CONSTRAINT "rejected_document_remedies_correction_check" CHECK (("rejected_document_remedies"."kind" = 'printed') = ("rejected_document_remedies"."correction" is not null))
);
--> statement-breakpoint
ALTER TABLE "credit_notes" DROP CONSTRAINT "credit_notes_reason_check";--> statement-breakpoint
ALTER TABLE "rejected_document_remedies" ADD CONSTRAINT "rejected_document_remedies_point_of_sale_number_point_of_sale_claims_point_of_sale_number_fk" FOREIGN KEY ("point_of_sale_number") REFERENCES "public"."point_of_sale_claims"("point_of_sale_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rejected_document_remedies_document_idx" ON "rejected_document_remedies" USING btree ("point_of_sale_number","fortnight_start","document_type","number");--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_reason_check" CHECK ("credit_notes"."reason" in ('orphan', 'sale_void', 'rejected_document'));--> statement-breakpoint
-- A remedy is a record of what was decided and when: the newest one in force is read, none is rewritten.
REVOKE UPDATE, DELETE, TRUNCATE ON "rejected_document_remedies" FROM cloud_app;
