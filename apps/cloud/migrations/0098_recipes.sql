CREATE TABLE "recipe_components" (
	"product_id" uuid NOT NULL,
	"component_product_id" uuid NOT NULL,
	"quantity_per_output_unit" bigint NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "recipe_components_pkey" PRIMARY KEY("product_id","component_product_id"),
	CONSTRAINT "recipe_components_product_id_position_key" UNIQUE("product_id","position"),
	CONSTRAINT "recipe_components_quantity_check" CHECK ("recipe_components"."quantity_per_output_unit" > 0),
	CONSTRAINT "recipe_components_not_itself_check" CHECK ("recipe_components"."product_id" <> "recipe_components"."component_product_id")
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"actor_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe_components" ADD CONSTRAINT "recipe_components_product_id_recipes_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."recipes"("product_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_components" ADD CONSTRAINT "recipe_components_component_product_id_products_id_fk" FOREIGN KEY ("component_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;