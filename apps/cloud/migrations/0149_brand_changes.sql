INSERT INTO "changes" ("entity", "entity_id", "version", "op")
SELECT 'brand', "id", "version", 'insert' FROM "brands" ORDER BY "id";
