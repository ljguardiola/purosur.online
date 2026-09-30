CREATE TABLE "user_pin_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"issued_by" uuid NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"redeemed_at" timestamp with time zone,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_pins" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"salt" text NOT NULL,
	"hash" text NOT NULL,
	"set_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_pin_codes" ADD CONSTRAINT "user_pin_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_pin_codes" ADD CONSTRAINT "user_pin_codes_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_pins" ADD CONSTRAINT "user_pins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_pin_codes_code_hash_key" ON "user_pin_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "user_pin_codes_user_id_issued_at_idx" ON "user_pin_codes" USING btree ("user_id","issued_at");