CREATE TABLE "register_qr_points_of_sale" (
	"register_id" uuid PRIMARY KEY NOT NULL,
	"external_pos_id" text,
	"version" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "register_qr_points_of_sale" ADD CONSTRAINT "register_qr_points_of_sale_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "register_qr_points_of_sale_external_pos_id_key" ON "register_qr_points_of_sale" USING btree ("external_pos_id");