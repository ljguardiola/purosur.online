import type { AlertEmailOptInReads } from "@purosur/domain/users/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { users } from "../platform/db/schema.js";

export function drizzleAlertEmailOptInReads<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): AlertEmailOptInReads {
  return {
    async findAlertEmailOptIn(userId, locationId) {
      const [row] = await db
        .select({ optedInAt: users.alertEmailOptedInAt })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.locationId, locationId), eq(users.active, true)));
      return row;
    },
  };
}
