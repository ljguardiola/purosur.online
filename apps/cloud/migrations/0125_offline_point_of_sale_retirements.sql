CREATE TABLE "offline_point_of_sale_retirements" (
	"point_of_sale_number" integer PRIMARY KEY NOT NULL,
	"retired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "offline_point_of_sale_retirements" ADD CONSTRAINT "offline_point_of_sale_retirements_point_of_sale_number_point_of_sale_claims_point_of_sale_number_fk" FOREIGN KEY ("point_of_sale_number") REFERENCES "public"."point_of_sale_claims"("point_of_sale_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_point_of_sale_retirements" ADD CONSTRAINT "offline_point_of_sale_retirements_retired_by_users_id_fk" FOREIGN KEY ("retired_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- A retirement is final: the tax authority never lets a retired number be used again.
REVOKE UPDATE, DELETE, TRUNCATE ON "offline_point_of_sale_retirements" FROM cloud_app;
