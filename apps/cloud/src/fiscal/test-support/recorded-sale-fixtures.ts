import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { cashSessions, sales } from "../../platform/db/schema.js";
import { insertEnrolledInstallation } from "../../register/test-support/enrolled-installation.js";
import { seededLocationId } from "../../test-support/seeded-location.js";

export async function insertRecordedSale<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { saleId, registerId, at }: { saleId: string; registerId: string; at: Date },
): Promise<void> {
  const { deviceId } = await insertEnrolledInstallation(db, {
    now: at,
    existingRegisterId: registerId,
  });
  const origin = { locationId: await seededLocationId(db), registerId, deviceId };
  const sessionId = crypto.randomUUID();
  const actorId = crypto.randomUUID();
  await db
    .insert(cashSessions)
    .values({ id: sessionId, ...origin, openedBy: actorId, openedAt: at, openingFloat: 0 });
  await db.insert(sales).values({
    id: saleId,
    ...origin,
    sessionId,
    actorId,
    state: "COMPLETED",
    completedAt: at,
    total: 1500,
    appliedAt: at,
  });
}
