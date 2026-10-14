CREATE TYPE "public"."snapshot_corruption_stage" AS ENUM('copy', 'integrity_check', 'foreign_key_check');--> statement-breakpoint
CREATE TYPE "public"."snapshot_failure_reason" AS ENUM('hash_mismatch', 'size_mismatch', 'never_uploaded');--> statement-breakpoint
CREATE TYPE "public"."snapshot_generation_status" AS ENUM('declared', 'uploaded', 'verified', 'failed');--> statement-breakpoint
CREATE TABLE "register_snapshot_generations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"register_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"key_version" integer NOT NULL,
	"status" "snapshot_generation_status" DEFAULT 'declared' NOT NULL,
	"failure_reason" "snapshot_failure_reason",
	"upload_reported_at" timestamp with time zone,
	"pruned" boolean DEFAULT false NOT NULL,
	"object_deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "register_snapshot_generations_size_check" CHECK ("register_snapshot_generations"."size" > 0),
	CONSTRAINT "register_snapshot_generations_sha256_check" CHECK ("register_snapshot_generations"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "register_snapshot_generations_failure_reason_check" CHECK (("register_snapshot_generations"."status" = 'failed') = ("register_snapshot_generations"."failure_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "register_snapshot_lifecycle_rules" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"hourly" integer NOT NULL,
	"daily" integer NOT NULL,
	"monthly" integer NOT NULL,
	CONSTRAINT "register_snapshot_lifecycle_rules_singleton_check" CHECK ("register_snapshot_lifecycle_rules"."singleton"),
	CONSTRAINT "register_snapshot_lifecycle_rules_hourly_check" CHECK ("register_snapshot_lifecycle_rules"."hourly" between 1 and 72),
	CONSTRAINT "register_snapshot_lifecycle_rules_daily_check" CHECK ("register_snapshot_lifecycle_rules"."daily" between 1 and 90),
	CONSTRAINT "register_snapshot_lifecycle_rules_monthly_check" CHECK ("register_snapshot_lifecycle_rules"."monthly" between 1 and 24)
);
--> statement-breakpoint
CREATE TABLE "register_snapshot_retention_freezes" (
	"register_id" uuid PRIMARY KEY NOT NULL,
	"stage" "snapshot_corruption_stage" NOT NULL,
	"frozen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "register_snapshot_generations" ADD CONSTRAINT "register_snapshot_generations_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_snapshot_generations" ADD CONSTRAINT "register_snapshot_generations_device_id_register_installations_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."register_installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_snapshot_generations" ADD CONSTRAINT "register_snapshot_generations_register_id_key_version_register_snapshot_keys_register_id_version_fk" FOREIGN KEY ("register_id","key_version") REFERENCES "public"."register_snapshot_keys"("register_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_snapshot_retention_freezes" ADD CONSTRAINT "register_snapshot_retention_freezes_register_id_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "register_snapshot_generations_register_id_created_at_idx" ON "register_snapshot_generations" USING btree ("register_id","created_at");