ALTER TABLE "device_state" ADD COLUMN "last_chain_hmac" text;--> statement-breakpoint
UPDATE "device_state" SET "last_chain_hmac" = "last_received"."chain_hmac"
FROM (
	SELECT DISTINCT ON ("device_id") "device_id", "chain_hmac"
	FROM "inbox"
	ORDER BY "device_id", "device_seq" DESC
) AS "last_received"
WHERE "device_state"."device_id" = "last_received"."device_id";
