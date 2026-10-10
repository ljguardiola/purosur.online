CREATE TABLE "price_review_postponements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"price_list_id" uuid NOT NULL,
	"postponed_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"resolved_by_review_id" uuid
);
--> statement-breakpoint
ALTER TABLE "price_review_postponements" ADD CONSTRAINT "price_review_postponements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_review_postponements" ADD CONSTRAINT "price_review_postponements_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_review_postponements" ADD CONSTRAINT "price_review_postponements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_review_postponements" ADD CONSTRAINT "price_review_postponements_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_review_postponements" ADD CONSTRAINT "price_review_postponements_resolved_by_review_fk" FOREIGN KEY ("resolved_by_review_id") REFERENCES "public"."price_reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_review_postponements_open_idx" ON "price_review_postponements" USING btree ("product_id","price_list_id") WHERE "price_review_postponements"."resolved_by_review_id" is null;--> statement-breakpoint
-- Unlike prices, UPDATE stays: a review resolves an open postponement in place.
REVOKE DELETE, TRUNCATE ON "price_review_postponements" FROM cloud_app;