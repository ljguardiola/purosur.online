CREATE TABLE "sale_reprints" (
	"sale_id" uuid NOT NULL,
	"order_number" integer NOT NULL,
	"requested_by" text NOT NULL,
	"authorized_by" text,
	"reason_kind" text NOT NULL,
	"reason_text" text,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sale_reprints_sale_id_order_number_pk" PRIMARY KEY("sale_id","order_number"),
	CONSTRAINT "sale_reprints_order_number_positive_check" CHECK ("sale_reprints"."order_number" > 0),
	CONSTRAINT "sale_reprints_reason_kind_check" CHECK ("sale_reprints"."reason_kind" in ('retry', 'requested')),
	CONSTRAINT "sale_reprints_reason_matches_kind_check" CHECK (("sale_reprints"."reason_kind" = 'requested') = ("sale_reprints"."reason_text" is not null))
);
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "operation_number" bigint;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "print_attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "printed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sale_reprints" ADD CONSTRAINT "sale_reprints_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_operation_number_positive_check" CHECK ("sales"."operation_number" > 0);--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_printed_only_after_attempted_check" CHECK ("sales"."printed_at" is null or "sales"."print_attempted_at" is not null);