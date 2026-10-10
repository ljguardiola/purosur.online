CREATE TYPE "public"."offline_number_block_status" AS ENUM('in_use');--> statement-breakpoint
CREATE TABLE "offline_number_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"point_of_sale_number" integer NOT NULL,
	"document_type" text NOT NULL,
	"register_id" uuid NOT NULL,
	"mechanism" "point_of_sale_mechanism" DEFAULT 'offline' NOT NULL,
	"first_number" integer NOT NULL,
	"last_number" integer NOT NULL,
	"status" "offline_number_block_status" NOT NULL,
	"assigned_at" timestamp with time zone NOT NULL,
	"version" integer NOT NULL,
	CONSTRAINT "offline_number_blocks_first_number_key" UNIQUE("point_of_sale_number","document_type","first_number"),
	CONSTRAINT "offline_number_blocks_last_number_key" UNIQUE("point_of_sale_number","document_type","last_number"),
	CONSTRAINT "offline_number_blocks_mechanism_offline" CHECK ("offline_number_blocks"."mechanism" = 'offline'),
	CONSTRAINT "offline_number_blocks_document_type_known" CHECK ("offline_number_blocks"."document_type" in ('factura_c')),
	CONSTRAINT "offline_number_blocks_range_valid" CHECK ("offline_number_blocks"."first_number" >= 1 and "offline_number_blocks"."last_number" >= "offline_number_blocks"."first_number")
);
--> statement-breakpoint
ALTER TABLE "caea_codes" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "changes" ADD COLUMN "register_id" uuid;--> statement-breakpoint
ALTER TABLE "offline_number_blocks" ADD CONSTRAINT "offline_number_blocks_claim_fk" FOREIGN KEY ("point_of_sale_number","register_id","mechanism") REFERENCES "public"."point_of_sale_claims"("point_of_sale_number","register_id","mechanism") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "changes_entity_register_id_idx" ON "changes" USING btree ("entity","register_id","change_seq");--> statement-breakpoint
ALTER TABLE "caea_codes" ADD CONSTRAINT "caea_codes_id_unique" UNIQUE("id");
--> statement-breakpoint
-- A block handed out stays on record for good; only its status will change.
REVOKE DELETE, TRUNCATE ON "offline_number_blocks" FROM cloud_app;
