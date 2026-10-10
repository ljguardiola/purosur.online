import type { AlertDetails } from "@purosur/domain";
import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../../alerts/open-alert.js";
import { alerts, inbox, locations, registers } from "../../platform/db/schema.js";
import { insertEnrolledInstallation } from "../../register/test-support/enrolled-installation.js";
import { insertInboxEvent } from "./inbox-events.js";

export const QUARANTINED_AT = new Date("2026-10-07T12:00:00.000Z");

export async function insertQuarantinedEvent<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deviceId: string,
  overrides: Parameters<typeof insertInboxEvent>[2] = {},
): Promise<string> {
  return insertInboxEvent(db, deviceId, {
    attempts: 8,
    quarantinedAt: QUARANTINED_AT,
    lastError: "product p-1 is not in the catalog",
    ...overrides,
  });
}

export async function insertInstallationOfAnotherBranch<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  now: Date,
): Promise<string> {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the other branch returned no row");
  }
  const { deviceId, registerId } = await insertEnrolledInstallation(db, {
    now,
    registerName: "Caja del otro local",
  });
  await db.update(registers).set({ locationId: location.id }).where(eq(registers.id, registerId));
  return deviceId;
}

export async function openQuarantineAlertOf<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  eventId: string,
  { reason, openedAt }: { reason: AlertDetails["events_quarantined"]["reason"]; openedAt: Date },
): Promise<void> {
  const [event] = await db
    .select({
      deviceId: inbox.deviceId,
      eventType: inbox.eventType,
      aggregateType: inbox.aggregateType,
      aggregateId: inbox.aggregateId,
    })
    .from(inbox)
    .where(eq(inbox.eventId, eventId));
  if (!event) {
    throw new Error("test setup: the quarantined event is not in the inbox");
  }
  const outcome = await openAlert(
    db,
    { kind: "events_quarantined", scope: eventId, detail: { ...event, eventId, reason } },
    { now: () => openedAt },
  );
  if (outcome.kind !== "opened") {
    throw new Error("test setup: opening the quarantine alert did not open one");
  }
}

export async function closeQuarantineAlertOf<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  eventId: string,
  resolvedAt: Date,
): Promise<void> {
  await db
    .update(alerts)
    .set({ resolvedAt })
    .where(
      and(
        eq(alerts.kind, "events_quarantined"),
        eq(alerts.scope, eventId),
        isNull(alerts.resolvedAt),
      ),
    );
}
