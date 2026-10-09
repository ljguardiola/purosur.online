DROP INDEX "buyer_identification_thresholds_valid_from_key";--> statement-breakpoint
ALTER TABLE "buyer_identification_thresholds" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "buyer_identification_thresholds_valid_from_revision_key" ON "buyer_identification_thresholds" USING btree ("valid_from","revision");