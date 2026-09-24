-- Roles are cluster-wide in Postgres, and the integration test suite creates many databases in
-- one container, migrating several of them at once, so two migrations can both see the role
-- missing and race to create it; the nested block catches the loser's "role already exists"
-- (duplicate_object) instead of failing the migration.
DO $$
BEGIN
  BEGIN
    CREATE ROLE cloud_app NOLOGIN;
  EXCEPTION WHEN duplicate_object THEN
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
