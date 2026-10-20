CREATE TABLE "register_installation_bitlocker_keys" (
	"installation_id" uuid PRIMARY KEY NOT NULL,
	"sealed_key" text NOT NULL,
	"key_identifier" text NOT NULL,
	"loaded_at" timestamp with time zone NOT NULL,
	"loaded_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "register_installation_bitlocker_keys" ADD CONSTRAINT "register_installation_bitlocker_keys_installation_id_register_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."register_installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_installation_bitlocker_keys" ADD CONSTRAINT "register_installation_bitlocker_keys_loaded_by_users_id_fk" FOREIGN KEY ("loaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;