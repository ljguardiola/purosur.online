INSERT INTO "changes" ("entity", "entity_id", "version", "op")
SELECT 'offline_authorization_code', "caea_codes"."id", 1, 'insert'
FROM "caea_codes"
WHERE NOT EXISTS (
  SELECT 1 FROM "changes"
  WHERE "changes"."entity" = 'offline_authorization_code'
    AND "changes"."entity_id" = "caea_codes"."id"
    AND "changes"."op" = 'insert'
)
ORDER BY "caea_codes"."id";
--> statement-breakpoint
CREATE FUNCTION require_offline_authorization_code_change() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "changes"
    WHERE "entity" = 'offline_authorization_code'
      AND "entity_id" = NEW."id"
      AND "op" = 'insert'
  ) THEN
    RAISE EXCEPTION 'offline authorization code % was kept without its insert change', NEW."id";
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER caea_codes_require_change
AFTER INSERT ON "caea_codes"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION require_offline_authorization_code_change();
