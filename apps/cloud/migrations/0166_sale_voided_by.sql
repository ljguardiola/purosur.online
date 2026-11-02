ALTER TABLE "sales" ADD COLUMN "voided_by" text;--> statement-breakpoint
UPDATE "sales"
SET "voided_by" = "voiding"."actor_id"
FROM (
  SELECT DISTINCT ON ("aggregate_id") "aggregate_id", "actor_id"
  FROM "inbox"
  WHERE "event_type" = 'sale_voided' AND "applied_at" IS NOT NULL
  ORDER BY "aggregate_id", "applied_at"
) AS "voiding"
WHERE "sales"."state" = 'VOIDED' AND "voiding"."aggregate_id" = "sales"."id"::text;--> statement-breakpoint
GRANT UPDATE ("voided_by") ON "sales" TO cloud_app;
