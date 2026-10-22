CREATE TABLE "sale_void_credit_note_refusals" (
	"credit_note_id" uuid PRIMARY KEY NOT NULL,
	"register_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"refused_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sale_void_credit_note_refusals" ADD CONSTRAINT "sale_void_credit_note_refusals_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- The first refusal is final: a later one never replaces it.
REVOKE UPDATE, DELETE, TRUNCATE ON "sale_void_credit_note_refusals" FROM cloud_app;
