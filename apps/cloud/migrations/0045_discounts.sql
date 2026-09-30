CREATE TABLE "discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"percent" integer,
	"product_id" uuid,
	"category_id" uuid,
	"tag_id" uuid,
	"valid_from" date NOT NULL,
	"valid_to" date NOT NULL,
	"weekdays" smallint[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "discounts_kind_check" CHECK ("discounts"."kind" in ('PERCENT_OFF')),
	CONSTRAINT "discounts_percent_check" CHECK ("discounts"."kind" <> 'PERCENT_OFF' or coalesce("discounts"."percent" between 1 and 99, false)),
	CONSTRAINT "discounts_exactly_one_target_check" CHECK (num_nonnulls("discounts"."product_id", "discounts"."category_id", "discounts"."tag_id") = 1),
	CONSTRAINT "discounts_valid_to_not_before_from_check" CHECK ("discounts"."valid_to" >= "discounts"."valid_from"),
	CONSTRAINT "discounts_weekdays_check" CHECK ("discounts"."weekdays" <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
);
--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discounts_product_id_idx" ON "discounts" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "discounts_category_id_idx" ON "discounts" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "discounts_tag_id_idx" ON "discounts" USING btree ("tag_id");