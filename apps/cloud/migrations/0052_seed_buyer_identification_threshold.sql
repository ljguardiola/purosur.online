ALTER TABLE "buyer_identification_thresholds" ALTER COLUMN "recorded_by" DROP NOT NULL;
--> statement-breakpoint
WITH "seeded" AS (
	INSERT INTO "buyer_identification_thresholds" ("amount", "valid_from")
	VALUES (1000000000, '2000-01-01')
	RETURNING "id"
)
INSERT INTO "changes" ("entity", "entity_id", "version", "op")
SELECT 'buyer_identification_threshold', "id", 1, 'insert' FROM "seeded";
