CREATE TABLE "supplier_price_list_ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"row_id" uuid,
	"purpose" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"occurred_on" date NOT NULL,
	"model" text NOT NULL,
	"input_tokens" bigint NOT NULL,
	"output_tokens" bigint NOT NULL,
	"cache_write_tokens" bigint NOT NULL,
	"cache_read_tokens" bigint NOT NULL,
	"outcome" text NOT NULL,
	"cost_nano_usd" bigint,
	CONSTRAINT "supplier_price_list_ai_calls_purpose_check" CHECK ("supplier_price_list_ai_calls"."purpose" in ('READING', 'LINK_PROPOSAL')),
	CONSTRAINT "supplier_price_list_ai_calls_outcome_check" CHECK ("supplier_price_list_ai_calls"."outcome" in ('completed', 'cut_short', 'failed')),
	CONSTRAINT "supplier_price_list_ai_calls_purpose_row_check" CHECK ("supplier_price_list_ai_calls"."purpose" <> 'READING' or "supplier_price_list_ai_calls"."row_id" is null),
	CONSTRAINT "supplier_price_list_ai_calls_tokens_check" CHECK ("supplier_price_list_ai_calls"."input_tokens" >= 0 and "supplier_price_list_ai_calls"."output_tokens" >= 0 and "supplier_price_list_ai_calls"."cache_write_tokens" >= 0 and "supplier_price_list_ai_calls"."cache_read_tokens" >= 0),
	CONSTRAINT "supplier_price_list_ai_calls_cost_check" CHECK ("supplier_price_list_ai_calls"."cost_nano_usd" >= 0)
);
--> statement-breakpoint
ALTER TABLE "supplier_price_lists" ADD COLUMN "ai_calls_recorded_from_start" boolean DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE "supplier_price_lists" SET "ai_calls_recorded_from_start" = false WHERE "sent_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_price_list_ai_calls" ADD CONSTRAINT "supplier_price_list_ai_calls_list_id_supplier_price_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."supplier_price_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_price_list_ai_calls" ADD CONSTRAINT "supplier_price_list_ai_calls_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_price_list_ai_calls" ADD CONSTRAINT "supplier_price_list_ai_calls_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_price_list_ai_calls" ADD CONSTRAINT "supplier_price_list_ai_calls_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_price_list_ai_calls_list_idx" ON "supplier_price_list_ai_calls" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "supplier_price_list_ai_calls_location_occurred_on_idx" ON "supplier_price_list_ai_calls" USING btree ("location_id","occurred_on");