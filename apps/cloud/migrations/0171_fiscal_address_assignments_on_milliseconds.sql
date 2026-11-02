UPDATE "register_fiscal_address_assignments"
SET "assigned_at" = date_trunc('milliseconds', "assigned_at")
WHERE "assigned_at" <> date_trunc('milliseconds', "assigned_at");
--> statement-breakpoint
ALTER TABLE "register_fiscal_address_assignments" ADD CONSTRAINT "register_fiscal_address_assignments_assigned_at_on_milliseconds" CHECK ("register_fiscal_address_assignments"."assigned_at" = date_trunc('milliseconds', "register_fiscal_address_assignments"."assigned_at"));
