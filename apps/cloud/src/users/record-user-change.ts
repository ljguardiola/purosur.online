import type { UserChange } from "@purosur/domain/users/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog } from "../platform/db/schema.js";

function auditValues(change: UserChange): { previousValue: unknown; newValue: unknown } {
  switch (change.kind) {
    case "created":
      return {
        previousValue: null,
        newValue: { firstName: change.firstName, email: change.email, roleId: change.roleId },
      };
    case "email_changed":
      return { previousValue: { email: change.previousEmail }, newValue: { email: change.email } };
    case "role_changed":
      return {
        previousValue: { roleId: change.previousRoleId },
        newValue: { roleId: change.roleId },
      };
    case "deactivated":
      return { previousValue: { active: true }, newValue: { active: false } };
    case "reactivated":
      return { previousValue: { active: false }, newValue: { active: true } };
    case "alert_email_opted_in":
      return {
        previousValue: { alertEmailOptedInAt: null },
        newValue: { alertEmailOptedInAt: change.optedInAt.toISOString() },
      };
    case "alert_email_opt_in_withdrawn":
      return {
        previousValue: { alertEmailOptedInAt: change.optedInAt.toISOString() },
        newValue: { alertEmailOptedInAt: null },
      };
  }
}

export async function recordUserChange<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  at: Date,
  userId: string,
  actorId: string,
  change: UserChange,
): Promise<void> {
  await tx.insert(auditLog).values({
    entity: "user",
    entityId: userId,
    actorId,
    ...auditValues(change),
    at,
  });
}
