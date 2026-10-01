CREATE TABLE "inbox" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"device_seq" bigint NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"event_type" text NOT NULL,
	"schema_version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_id" text NOT NULL,
	"chain_hmac" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	CONSTRAINT "inbox_device_id_device_seq_key" UNIQUE("device_id","device_seq"),
	CONSTRAINT "inbox_device_seq_positive" CHECK ("inbox"."device_seq" > 0)
);
--> statement-breakpoint
ALTER TABLE "device_state" ALTER COLUMN "last_pull_since" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "device_state" ALTER COLUMN "last_pulled_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "device_state" ADD COLUMN "app_version" text;--> statement-breakpoint
ALTER TABLE "device_state" ADD COLUMN "last_pushed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "device_state" ADD COLUMN "wal_size_bytes" bigint;--> statement-breakpoint
ALTER TABLE "device_state" ADD COLUMN "disk_free_bytes" bigint;--> statement-breakpoint
ALTER TABLE "device_state" ADD COLUMN "disk_free_ratio" double precision;--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_device_id_register_installations_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."register_installations"("id") ON DELETE no action ON UPDATE no action;