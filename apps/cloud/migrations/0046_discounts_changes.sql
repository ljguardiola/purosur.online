-- Every discount that exists before its changes were logged is logged once, so a register
-- pulling from the very first cursor receives them.
INSERT INTO "changes" ("entity", "entity_id", "version", "op")
SELECT 'discount', "id", "version", 'insert' FROM "discounts" ORDER BY "id";
