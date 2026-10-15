CREATE TABLE "offsite_dump_checks" (
	"night" date PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"size_bytes" bigint,
	"failure_reason" text,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "offsite_dump_checks_result_shape_check" CHECK (("offsite_dump_checks"."status" = 'verified' and "offsite_dump_checks"."size_bytes" is not null and "offsite_dump_checks"."failure_reason" is null) or ("offsite_dump_checks"."status" = 'failed' and "offsite_dump_checks"."failure_reason" = 'shrank' and "offsite_dump_checks"."size_bytes" is not null) or ("offsite_dump_checks"."status" = 'failed' and "offsite_dump_checks"."failure_reason" is not null and "offsite_dump_checks"."failure_reason" <> 'shrank' and "offsite_dump_checks"."size_bytes" is null))
);

--> statement-breakpoint
DO $$
BEGIN
  BEGIN
    CREATE ROLE offsite_dump NOLOGIN;
  EXCEPTION WHEN duplicate_object OR unique_violation THEN
    NULL;
  END;
END
$$;
--> statement-breakpoint
GRANT pg_read_all_data TO offsite_dump;
