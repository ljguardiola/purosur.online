UPDATE "sales"
SET "voided_by" = "voiding"."actor_id"
FROM (
  SELECT DISTINCT ON ("aggregate_id") "aggregate_id", "actor_id"
  FROM "inbox"
  WHERE "event_type" = 'sale_voided' AND "applied_at" IS NOT NULL
  ORDER BY "aggregate_id", "applied_at"
) AS "voiding"
WHERE "sales"."state" = 'VOIDED'
  AND "sales"."voided_by" IS NULL
  AND "voiding"."aggregate_id" = "sales"."id"::text;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_voided_by_only_when_voided_check" CHECK (("sales"."state" = 'VOIDED') = ("sales"."voided_by" is not null));
