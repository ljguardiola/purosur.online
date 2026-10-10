CREATE TYPE "public"."point_of_sale_mechanism" AS ENUM('real_time', 'offline');--> statement-breakpoint
CREATE TABLE "register_offline_points_of_sale" (
	"register_id" uuid PRIMARY KEY NOT NULL,
	"point_of_sale_number" integer NOT NULL,
	"mechanism" "point_of_sale_mechanism" DEFAULT 'offline' NOT NULL,
	"version" integer NOT NULL,
	CONSTRAINT "register_offline_points_of_sale_mechanism_offline" CHECK ("register_offline_points_of_sale"."mechanism" = 'offline')
);
--> statement-breakpoint
ALTER TABLE "register_points_of_sale" DROP CONSTRAINT "register_points_of_sale_claim_fk";--> statement-breakpoint
ALTER TABLE "point_of_sale_claims" DROP CONSTRAINT "point_of_sale_claims_number_register_key";--> statement-breakpoint
ALTER TABLE "point_of_sale_claims" ADD COLUMN "mechanism" "point_of_sale_mechanism" DEFAULT 'real_time' NOT NULL;--> statement-breakpoint
ALTER TABLE "point_of_sale_claims" ALTER COLUMN "mechanism" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "register_points_of_sale" ADD COLUMN "mechanism" "point_of_sale_mechanism" DEFAULT 'real_time' NOT NULL;--> statement-breakpoint
ALTER TABLE "point_of_sale_claims" ADD CONSTRAINT "point_of_sale_claims_number_register_mechanism_key" UNIQUE("point_of_sale_number","register_id","mechanism");--> statement-breakpoint
ALTER TABLE "register_points_of_sale" ADD CONSTRAINT "register_points_of_sale_mechanism_real_time" CHECK ("register_points_of_sale"."mechanism" = 'real_time');--> statement-breakpoint
ALTER TABLE "register_points_of_sale" ADD CONSTRAINT "register_points_of_sale_claim_fk" FOREIGN KEY ("point_of_sale_number","register_id","mechanism") REFERENCES "public"."point_of_sale_claims"("point_of_sale_number","register_id","mechanism") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_offline_points_of_sale" ADD CONSTRAINT "register_offline_points_of_sale_register_fk" FOREIGN KEY ("register_id") REFERENCES "public"."register_points_of_sale"("register_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_offline_points_of_sale" ADD CONSTRAINT "register_offline_points_of_sale_claim_fk" FOREIGN KEY ("point_of_sale_number","register_id","mechanism") REFERENCES "public"."point_of_sale_claims"("point_of_sale_number","register_id","mechanism") ON DELETE no action ON UPDATE no action;
