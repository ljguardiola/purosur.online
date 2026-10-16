import { randomUUID } from "node:crypto";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alerts, clockCorrections, locations, registers, users } from "../../platform/db/schema.js";

export interface InsertedClockCorrection {
  eventId: string;
  alertId: string;
}

export async function insertClockCorrection<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  {
    registerId,
    actorId,
    correctedAt,
    pointOfSale = 7,
    previousReading = new Date("2026-10-20T12:00:00.000Z"),
    alertClosed = false,
  }: {
    registerId: string;
    actorId: string;
    correctedAt: Date;
    pointOfSale?: number;
    previousReading?: Date;
    alertClosed?: boolean;
  },
): Promise<InsertedClockCorrection> {
  const [alert] = await db
    .insert(alerts)
    .values({
      kind: "clock_corrected",
      scope: registerId,
      level: "critical",
      audience: "all",
      deduplicates: false,
      detail: {
        pointOfSale,
        documentType: "factura_c",
        previousReading: previousReading.toISOString(),
        correctedReading: correctedAt.toISOString(),
        actorId,
      },
      openedAt: correctedAt,
      resolvedAt: alertClosed ? new Date(correctedAt.getTime() + 3_600_000) : null,
    })
    .returning({ id: alerts.id });
  if (!alert) {
    throw new Error("test setup: seeding the alert returned no row");
  }
  const eventId = randomUUID();
  await db.insert(clockCorrections).values({
    eventId,
    registerId,
    pointOfSale,
    documentType: "factura_c",
    previousReading,
    correctedReading: correctedAt,
    actorId,
    correctedAt,
    alertId: alert.id,
    recordedAt: correctedAt,
  });
  return { eventId, alertId: alert.id };
}

export async function insertRegisterAndActor<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  {
    locationId,
    registerName,
    actorName,
  }: { locationId: string; registerName: string; actorName: string },
): Promise<{ registerId: string; actorId: string }> {
  const [register] = await db
    .insert(registers)
    .values({ locationId, name: registerName })
    .returning({ id: registers.id });
  const [actor] = await db
    .insert(users)
    .values({ firstName: actorName, email: `${randomUUID()}@example.com`, locationId })
    .returning({ id: users.id });
  if (!register || !actor) {
    throw new Error("test setup: seeding the register or the actor returned no row");
  }
  return { registerId: register.id, actorId: actor.id };
}

export async function insertOtherLocation<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<string> {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the other location returned no row");
  }
  return location.id;
}
