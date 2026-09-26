-- Roles are cluster-wide, so two migrations across the integration suite's databases can race to
-- create this one, failing as duplicate_object (42710) or, in a tighter race, unique_violation (23505).
DO $$
BEGIN
  BEGIN
    CREATE ROLE cloud_app NOLOGIN;
  EXCEPTION WHEN duplicate_object OR unique_violation THEN
    NULL;
  END;
END
$$;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO cloud_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cloud_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cloud_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cloud_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO cloud_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM cloud_app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA drizzle TO cloud_app;
--> statement-breakpoint
GRANT SELECT ON drizzle.__drizzle_migrations TO cloud_app;
