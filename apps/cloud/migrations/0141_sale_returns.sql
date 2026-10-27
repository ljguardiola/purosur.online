CREATE TABLE "return_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"sale_line_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"reason" text NOT NULL,
	"disposition" text NOT NULL,
	"refunded_amount" bigint NOT NULL,
	CONSTRAINT "return_lines_quantity_check" CHECK ("return_lines"."quantity" > 0),
	CONSTRAINT "return_lines_reason_check" CHECK ("return_lines"."reason" in ('change_of_mind', 'defective')),
	CONSTRAINT "return_lines_disposition_check" CHECK ("return_lines"."disposition" in ('restock', 'discard')),
	CONSTRAINT "return_lines_refunded_amount_check" CHECK ("return_lines"."refunded_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"register_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"authorized_by" text,
	"ticket_source" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"origin_event_id" uuid NOT NULL,
	CONSTRAINT "returns_origin_event_id_key" UNIQUE("origin_event_id"),
	CONSTRAINT "returns_ticket_source_check" CHECK ("returns"."ticket_source" in ('QR', 'TYPED'))
);
--> statement-breakpoint
ALTER TABLE "payment_refunds" DROP CONSTRAINT "payment_refunds_origin_check";--> statement-breakpoint
ALTER TABLE "payment_refunds" DROP CONSTRAINT "payment_refunds_source_check";--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_kind_check";--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_reason_unless_count_sale_or_receipt_check";--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_sale_line_iff_sale_check";--> statement-breakpoint
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_return_id_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_sale_line_id_sale_lines_id_fk" FOREIGN KEY ("sale_line_id") REFERENCES "public"."sale_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_device_id_register_installations_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."register_installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_session_id_cash_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "return_lines_sale_line_id_idx" ON "return_lines" USING btree ("sale_line_id");--> statement-breakpoint
CREATE INDEX "return_lines_return_id_idx" ON "return_lines" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX "returns_sale_id_idx" ON "returns" USING btree ("sale_id");--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_origin_check" CHECK ("payment_refunds"."origin" in ('sale_cancelled', 'late_payment', 'sale_voided', 'return'));--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_source_check" CHECK (("payment_refunds"."origin" = 'late_payment' and "payment_refunds"."payment_id" is null and "payment_refunds"."payment_transaction_id" is not null and "payment_refunds"."origin_event_id" is null) or ("payment_refunds"."origin" in ('sale_cancelled', 'sale_voided', 'return') and "payment_refunds"."payment_id" is not null));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_kind_check" CHECK ("stock_movements"."kind" in ('loss', 'adjustment', 'count', 'sale', 'sale_void', 'return', 'receipt', 'opening_count', 'opening_count_withdrawal', 'assembly_out', 'assembly_in'));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reason_unless_count_sale_or_receipt_check" CHECK (("stock_movements"."kind" in ('count', 'sale', 'sale_void', 'return', 'receipt', 'opening_count', 'opening_count_withdrawal', 'assembly_out', 'assembly_in')) = ("stock_movements"."reason" is null));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_line_iff_sale_check" CHECK (("stock_movements"."kind" in ('sale', 'sale_void', 'return')) = ("stock_movements"."sale_line_id" is not null));--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "returns" FROM cloud_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "return_lines" FROM cloud_app;
