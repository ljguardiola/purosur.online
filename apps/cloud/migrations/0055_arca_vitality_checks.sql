CREATE TABLE "arca_vitality_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"ok" boolean NOT NULL
);
--> statement-breakpoint
CREATE INDEX "arca_vitality_checks_checked_at_idx" ON "arca_vitality_checks" USING btree ("checked_at");