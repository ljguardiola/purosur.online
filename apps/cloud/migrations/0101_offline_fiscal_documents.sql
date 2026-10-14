CREATE TABLE "offline_fiscal_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"register_id" uuid NOT NULL,
	"point_of_sale" integer NOT NULL,
	"document_type" text NOT NULL,
	"number" integer NOT NULL,
	"issued_on" date NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"generation_stamp" text NOT NULL,
	"offline_authorization_code" text NOT NULL,
	"fortnight_start" date NOT NULL,
	"fortnight_end" date NOT NULL,
	"buyer_document_type" integer NOT NULL,
	"buyer_document_number" bigint NOT NULL,
	"buyer_tax_status_code" integer NOT NULL,
	"total" bigint NOT NULL,
	"net_amount" bigint NOT NULL,
	"cause" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "offline_fiscal_documents_sale_id_unique" UNIQUE("sale_id"),
	CONSTRAINT "offline_fiscal_documents_number_key" UNIQUE("point_of_sale","document_type","number"),
	CONSTRAINT "offline_fiscal_documents_document_type_known" CHECK ("offline_fiscal_documents"."document_type" in ('factura_c')),
	CONSTRAINT "offline_fiscal_documents_cause_known" CHECK ("offline_fiscal_documents"."cause" in ('no_connectivity', 'unclear_outcome', 'numbering_conflict')),
	CONSTRAINT "offline_fiscal_documents_generation_stamp_shape" CHECK ("offline_fiscal_documents"."generation_stamp" ~ '^[0-9]{14}$')
);
--> statement-breakpoint
ALTER TABLE "offline_fiscal_documents" ADD CONSTRAINT "offline_fiscal_documents_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- A document issued under a pre-obtained code stays on record for good.
REVOKE UPDATE, DELETE, TRUNCATE ON "offline_fiscal_documents" FROM cloud_app;
