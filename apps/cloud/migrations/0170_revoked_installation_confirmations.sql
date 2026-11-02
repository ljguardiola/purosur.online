CREATE TABLE "revoked_installation_confirmations" (
	"point_of_sale_number" integer NOT NULL,
	"fortnight_start" date NOT NULL,
	"installation_id" uuid NOT NULL,
	"confirmed_by" uuid NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "revoked_installation_confirmations_pkey" PRIMARY KEY("point_of_sale_number","fortnight_start","installation_id")
);
--> statement-breakpoint
ALTER TABLE "revoked_installation_confirmations" ADD CONSTRAINT "revoked_installation_confirmations_point_of_sale_number_point_of_sale_claims_point_of_sale_number_fk" FOREIGN KEY ("point_of_sale_number") REFERENCES "public"."point_of_sale_claims"("point_of_sale_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revoked_installation_confirmations" ADD CONSTRAINT "revoked_installation_confirmations_installation_id_register_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."register_installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revoked_installation_confirmations" ADD CONSTRAINT "revoked_installation_confirmations_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- A confirmation is a record of who decided, and when, that a revoked installation issued nothing it did not sync: none is rewritten or removed.
REVOKE UPDATE, DELETE, TRUNCATE ON "revoked_installation_confirmations" FROM cloud_app;
