CREATE TABLE "deferred_sales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"register_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"total" bigint NOT NULL,
	"reason" text NOT NULL,
	"short_code" text NOT NULL,
	"routed_at" timestamp with time zone NOT NULL,
	"state" text NOT NULL,
	"satisfied_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	CONSTRAINT "deferred_sales_state_check" CHECK ("deferred_sales"."state" in ('pending', 'satisfied', 'cancelled', 'expired')),
	CONSTRAINT "deferred_sales_satisfied_time_check" CHECK (("deferred_sales"."state" = 'satisfied') = ("deferred_sales"."satisfied_at" is not null)),
	CONSTRAINT "deferred_sales_cancelled_time_check" CHECK (("deferred_sales"."state" = 'cancelled') = ("deferred_sales"."cancelled_at" is not null)),
	CONSTRAINT "deferred_sales_expired_time_check" CHECK (("deferred_sales"."state" = 'expired' and "deferred_sales"."expired_at" is not null) or ("deferred_sales"."state" = 'pending' and "deferred_sales"."expired_at" is null) or "deferred_sales"."state" in ('satisfied', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "fiscal_tasks" DROP CONSTRAINT "fiscal_tasks_kind_check";--> statement-breakpoint
ALTER TABLE "fiscal_tasks" ALTER COLUMN "point_of_sale" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "fiscal_tasks" ALTER COLUMN "document_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "fiscal_tasks" ALTER COLUMN "number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "fiscal_tasks" ADD COLUMN "deferred_sale_id" uuid;--> statement-breakpoint
ALTER TABLE "deferred_sales" ADD CONSTRAINT "deferred_sales_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deferred_sales" ADD CONSTRAINT "deferred_sales_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deferred_sales_pending_idx" ON "deferred_sales" USING btree ("occurred_at") WHERE "deferred_sales"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "deferred_sales_unbilled_idx" ON "deferred_sales" USING btree ("location_id","occurred_at") WHERE "deferred_sales"."state" in ('pending', 'expired');--> statement-breakpoint
CREATE INDEX "deferred_sales_sale_idx" ON "deferred_sales" USING btree ("sale_id");--> statement-breakpoint
ALTER TABLE "fiscal_tasks" ADD CONSTRAINT "fiscal_tasks_deferred_sale_id_deferred_sales_id_fk" FOREIGN KEY ("deferred_sale_id") REFERENCES "public"."deferred_sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_tasks_deferred_sale_key" ON "fiscal_tasks" USING btree ("deferred_sale_id");--> statement-breakpoint
ALTER TABLE "fiscal_tasks" ADD CONSTRAINT "fiscal_tasks_deferred_sale_check" CHECK (("fiscal_tasks"."kind" = 'deferred_sale_expired') = ("fiscal_tasks"."deferred_sale_id" is not null));--> statement-breakpoint
ALTER TABLE "fiscal_tasks" ADD CONSTRAINT "fiscal_tasks_voucher_check" CHECK (("fiscal_tasks"."kind" = 'deferred_sale_expired' and "fiscal_tasks"."point_of_sale" is null and "fiscal_tasks"."document_type" is null and "fiscal_tasks"."number" is null) or ("fiscal_tasks"."kind" <> 'deferred_sale_expired' and "fiscal_tasks"."point_of_sale" is not null and "fiscal_tasks"."document_type" is not null and "fiscal_tasks"."number" is not null));--> statement-breakpoint
ALTER TABLE "fiscal_tasks" ADD CONSTRAINT "fiscal_tasks_kind_check" CHECK ("fiscal_tasks"."kind" in ('external_invoicing', 'credit_note_rejected', 'deferred_sale_expired'));