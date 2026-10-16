import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { userPins, users } from "../platform/db/schema.js";
import type { PendingChanges } from "../sync/change-log.js";

export async function removeUserPin<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  pending: PendingChanges,
  locationId: string,
  userId: string,
): Promise<boolean> {
  const removed = await tx
    .delete(userPins)
    .where(eq(userPins.userId, userId))
    .returning({ userId: userPins.userId });
  if (removed.length === 0) {
    return false;
  }
  // The register learns a PIN is gone only through a newer version of the user.
  const [user] = await tx
    .update(users)
    .set({ version: sql`${users.version} + 1` })
    .where(eq(users.id, userId))
    .returning({ version: users.version });
  if (!user) {
    throw new Error("a removed PIN had no user");
  }
  pending.note({
    entity: "user",
    entityId: userId,
    version: user.version,
    op: "update",
    locationId,
  });
  return true;
}
