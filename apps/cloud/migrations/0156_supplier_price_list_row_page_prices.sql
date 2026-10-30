ALTER TABLE "supplier_price_list_rows" ADD COLUMN "page_price_cents" bigint;--> statement-breakpoint
UPDATE "supplier_price_list_rows" AS "stored"
SET "page_price_cents" = CASE WHEN "first_edit"."found" THEN "first_edit"."page_price_cents" ELSE "stored"."price_cents" END
FROM "supplier_price_list_rows" AS "row"
JOIN "supplier_price_lists" AS "list" ON "list"."id" = "row"."list_id"
LEFT JOIN LATERAL (
  SELECT true AS "found", ("audit_log"."previous_value" ->> 'priceCents')::bigint AS "page_price_cents"
  FROM "audit_log"
  WHERE "audit_log"."entity" = 'supplier_price_list_row' AND "audit_log"."entity_id" = "row"."id"
    AND "audit_log"."new_value" ? 'priceCents' AND "audit_log"."previous_value" ? 'priceCents'
    AND "audit_log"."at" >= "list"."extracted_at"
  ORDER BY "audit_log"."at", "audit_log"."id" LIMIT 1
) AS "first_edit" ON true
WHERE "stored"."id" = "row"."id";--> statement-breakpoint
ALTER TABLE "supplier_price_list_rows" ADD CONSTRAINT "supplier_price_list_rows_page_price_check" CHECK ("supplier_price_list_rows"."page_price_cents" >= 0);
