CREATE TABLE "freight_purchases" (
	"freight_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	CONSTRAINT "freight_purchases_pkey" PRIMARY KEY("freight_id","purchase_id")
);
--> statement-breakpoint
CREATE TABLE "freights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"freight_on" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"description" text NOT NULL,
	"means_kind" text NOT NULL,
	"carrier_name" text,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "freights_amount_check" CHECK ("freights"."amount_cents" > 0),
	CONSTRAINT "freights_means_kind_check" CHECK ("freights"."means_kind" in ('carrier', 'own_trip')),
	CONSTRAINT "freights_carrier_name_iff_carrier_check" CHECK (("freights"."means_kind" = 'carrier') = ("freights"."carrier_name" is not null))
);
--> statement-breakpoint
ALTER TABLE "freight_purchases" ADD CONSTRAINT "freight_purchases_freight_id_freights_id_fk" FOREIGN KEY ("freight_id") REFERENCES "public"."freights"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freight_purchases" ADD CONSTRAINT "freight_purchases_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freights" ADD CONSTRAINT "freights_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freights" ADD CONSTRAINT "freights_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "freight_purchases_purchase_id_idx" ON "freight_purchases" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "freights_location_id_freight_on_idx" ON "freights" USING btree ("location_id","freight_on");