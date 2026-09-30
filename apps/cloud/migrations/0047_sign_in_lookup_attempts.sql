CREATE TABLE "sign_in_lookup_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"register_id" uuid NOT NULL,
	"attempted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sign_in_lookup_attempts" ADD CONSTRAINT "sign_in_lookup_attempts_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sign_in_lookup_attempts_register_id_attempted_at_idx" ON "sign_in_lookup_attempts" USING btree ("register_id","attempted_at");--> statement-breakpoint
CREATE INDEX "sign_in_lookup_attempts_attempted_at_idx" ON "sign_in_lookup_attempts" USING btree ("attempted_at");