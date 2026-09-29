ALTER TABLE "register_installations" ADD COLUMN "token_issued_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "register_installations" ALTER COLUMN "token_issued_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "register_installations" ADD COLUMN "pending_token_lookup_prefix" text;--> statement-breakpoint
ALTER TABLE "register_installations" ADD COLUMN "pending_token_hash" text;--> statement-breakpoint
ALTER TABLE "register_installations" ADD COLUMN "pending_token_issued_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "register_installations_pending_token_lookup_prefix_key" ON "register_installations" USING btree ("pending_token_lookup_prefix");