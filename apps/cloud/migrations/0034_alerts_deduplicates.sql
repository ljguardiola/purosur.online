DROP INDEX "alerts_open_dedup_key";--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "deduplicates" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_open_dedup_key" ON "alerts" USING btree ("kind","scope") WHERE "alerts"."resolved_at" IS NULL AND "alerts"."deduplicates";