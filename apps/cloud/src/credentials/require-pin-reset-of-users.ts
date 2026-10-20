import { and, asc, eq, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog, userPins, users } from "../platform/db/schema.js";
import type { PendingChanges } from "../sync/change-log.js";
import { removeUserPin } from "./remove-user-pin.js";

export interface PinResetRequirement {
  branchId?: string;
  actorId: string;
  requiredBy: "register_revocation" | "compromise_response";
  at: Date;
}

export async function requirePinResetOfUsers<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  pending: PendingChanges,
  { branchId, actorId, requiredBy, at }: PinResetRequirement,
): Promise<number> {
  const inScope: SQL | undefined =
    branchId === undefined ? undefined : eq(users.locationId, branchId);
  await tx
    .select({ id: users.id })
    .from(users)
    .where(inScope)
    .orderBy(asc(users.id))
    .for("no key update");
  const holders = await tx
    .select({ userId: userPins.userId, locationId: users.locationId })
    .from(userPins)
    .innerJoin(users, eq(users.id, userPins.userId))
    .where(and(inScope))
    .orderBy(asc(userPins.userId));
  let removed = 0;
  for (const { userId, locationId } of holders) {
    if (await removeUserPin(tx, pending, locationId, userId)) {
      removed += 1;
      await tx.insert(auditLog).values({
        entity: "user",
        entityId: userId,
        actorId,
        newValue: { pin_reset_required_by: requiredBy },
        at,
      });
    }
  }
  return removed;
}
