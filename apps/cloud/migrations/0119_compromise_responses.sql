CREATE TABLE "compromise_response_completions" (
	"response_id" uuid NOT NULL,
	"key" text NOT NULL,
	"done_by" uuid NOT NULL,
	"done_at" timestamp with time zone NOT NULL,
	CONSTRAINT "compromise_response_completions_pk" PRIMARY KEY("response_id","key"),
	CONSTRAINT "compromise_response_completions_key_check" CHECK ("compromise_response_completions"."key" in ('revoke_every_installation', 'end_sessions_and_remove_passkeys', 'force_pin_resets', 'mercado_pago_webhook_secret', 'whatsapp_webhook_token', 'whatsapp_webhook_secret', 'claude_api_key', 'postgres_credentials', 'ci_deployment_credentials', 'storage_bucket_credentials', 'arca_certificate_and_private_key', 'notify'))
);
--> statement-breakpoint
CREATE TABLE "compromise_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"started_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compromise_response_completions" ADD CONSTRAINT "compromise_response_completions_response_id_compromise_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."compromise_responses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compromise_response_completions" ADD CONSTRAINT "compromise_response_completions_done_by_users_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compromise_responses" ADD CONSTRAINT "compromise_responses_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;