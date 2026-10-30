CREATE TEMPORARY TABLE "tiendista_item_keys" AS
SELECT
  "keyed"."id",
  "keyed"."new_key",
  "keyed"."last_confirmed_at",
  first_value("keyed"."id") OVER (
    PARTITION BY "keyed"."supplier_id", "keyed"."new_key"
    ORDER BY "keyed"."last_confirmed_at" DESC NULLS LAST, "keyed"."id"
  ) AS "winner_id"
FROM (
  SELECT
    "split"."id",
    "split"."supplier_id",
    "split"."last_confirmed_at",
    CASE
      WHEN "split"."presentation" = '' THEN "split"."description"
      ELSE "split"."description" || E'\n' || "split"."presentation"
    END AS "new_key"
  FROM (
    SELECT
      "item"."id",
      "item"."supplier_id",
      split_part("item"."key_value", E'\n', 1) AS "description",
      btrim(regexp_replace(
        substr("item"."key_value", length(split_part("item"."key_value", E'\n', 1)) + 2),
        '\s*(?:\([^()]*c/u|\(\s*\$[^()]*kg|(?:^|\s)\$[^()]*kg)\s*\)$',
        '',
        'i'
      )) AS "presentation",
      (
        SELECT max("price"."confirmed_at")
        FROM "supplier_item_prices" "price"
        WHERE "price"."item_id" = "item"."id"
      ) AS "last_confirmed_at"
    FROM "supplier_items" "item"
    WHERE "item"."key_kind" = 'description'
      AND EXISTS (
        SELECT 1
        FROM "supplier_price_lists" "list"
        WHERE "list"."supplier_id" = "item"."supplier_id"
          AND "list"."file_content_kind" = 'STORE_CATALOG'
      )
  ) "split"
) "keyed";
--> statement-breakpoint
UPDATE "supplier_item_prices" "price"
SET "item_id" = "moved"."winner_id"
FROM (
  SELECT DISTINCT ON ("key"."winner_id", "loser_price"."list_id")
    "loser_price"."item_id",
    "loser_price"."list_id",
    "key"."winner_id"
  FROM "supplier_item_prices" "loser_price"
  JOIN "tiendista_item_keys" "key" ON "key"."id" = "loser_price"."item_id"
  WHERE "key"."id" <> "key"."winner_id"
    AND NOT EXISTS (
      SELECT 1
      FROM "supplier_item_prices" "winner_price"
      WHERE "winner_price"."item_id" = "key"."winner_id"
        AND "winner_price"."list_id" = "loser_price"."list_id"
    )
  ORDER BY "key"."winner_id", "loser_price"."list_id", "key"."last_confirmed_at" DESC NULLS LAST, "key"."id"
) "moved"
WHERE "price"."item_id" = "moved"."item_id"
  AND "price"."list_id" = "moved"."list_id";
--> statement-breakpoint
DELETE FROM "supplier_item_prices" "price"
USING "tiendista_item_keys" "key"
WHERE "price"."item_id" = "key"."id"
  AND "key"."id" <> "key"."winner_id";
--> statement-breakpoint
DELETE FROM "supplier_items" "item"
USING "tiendista_item_keys" "key"
WHERE "item"."id" = "key"."id"
  AND "key"."id" <> "key"."winner_id";
--> statement-breakpoint
UPDATE "supplier_items" "item"
SET "key_value" = "key"."new_key"
FROM "tiendista_item_keys" "key"
WHERE "item"."id" = "key"."id"
  AND "key"."id" = "key"."winner_id"
  AND "item"."key_value" <> "key"."new_key";
--> statement-breakpoint
DROP TABLE "tiendista_item_keys";
--> statement-breakpoint
UPDATE "supplier_price_list_rows" "row"
SET "presentation" = nullif(regexp_replace(
  regexp_replace(
    "row"."presentation",
    '\s*(?:\([^()]*c/u|\(\s*\$[^()]*kg|(?:^|\s)\$[^()]*kg)\s*\)$',
    '',
    'i'
  ),
  '^\s+|\s+$',
  '',
  'g'
), '')
FROM "supplier_price_lists" "list"
WHERE "row"."list_id" = "list"."id"
  AND "list"."file_content_kind" = 'STORE_CATALOG'
  AND "list"."confirmed_at" IS NULL
  AND "list"."discarded_at" IS NULL
  AND "row"."presentation" IS NOT NULL;
