CREATE TABLE "offsite_dump_checks" (
	"night" date PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"size_bytes" bigint,
	"failure_reason" text,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "offsite_dump_checks_result_shape_check" CHECK (("offsite_dump_checks"."status" = 'verified' and "offsite_dump_checks"."size_bytes" is not null and "offsite_dump_checks"."failure_reason" is null) or ("offsite_dump_checks"."status" = 'failed' and "offsite_dump_checks"."size_bytes" is null and "offsite_dump_checks"."failure_reason" is not null))
);
