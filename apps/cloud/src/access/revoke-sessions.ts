import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { sessions } from "../platform/db/schema.js";

export async function revokeSessions<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  userId: string,
  at: Date,
): Promise<void> {
  await tx
    .update(sessions)
    .set({ revokedAt: at })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}
