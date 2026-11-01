ALTER TABLE "sale_lines" ADD COLUMN "promotion_kind" text;--> statement-breakpoint
UPDATE "sale_lines"
SET "promotion_kind" = "applied"."kind"
FROM (
  SELECT DISTINCT ON ("line" ->> 'id', "promotion" ->> 'discount_id')
    "line" ->> 'id' AS "line_id",
    "promotion" ->> 'discount_id' AS "discount_id",
    "promotion" ->> 'kind' AS "kind"
  FROM "inbox"
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof("inbox"."payload" -> 'lines') = 'array' THEN "inbox"."payload" -> 'lines' ELSE '[]'::jsonb END
  ) AS "line"
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof("line" -> 'promotions') = 'array' THEN "line" -> 'promotions' ELSE '[]'::jsonb END
  ) AS "promotion"
  WHERE "inbox"."event_type" = 'sale_completed'
    AND jsonb_typeof("line") = 'object'
    AND jsonb_typeof("promotion") = 'object'
    AND "promotion" ->> 'kind' IN ('PERCENT_OFF', 'BUY_N_PAY_M')
) AS "applied"
WHERE "sale_lines"."id"::text = "applied"."line_id"
  AND "sale_lines"."promotion_id"::text = "applied"."discount_id";--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_promotion_kind_check" CHECK ("sale_lines"."promotion_kind" IS NULL OR ("sale_lines"."promotion_id" IS NOT NULL AND "sale_lines"."promotion_kind" IN ('PERCENT_OFF', 'BUY_N_PAY_M')));
