import { clockCorrectedObservation } from "@purosur/domain";
import type { SyncedFact, UnappliedEvent } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import { clockCorrections } from "../platform/db/schema.js";
import type { AppliedOrigin } from "../register/drizzle-applied-cash-sessions.js";

export async function recordAppliedClockCorrection<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  origin: AppliedOrigin,
  { correction }: Extract<SyncedFact, { kind: "clock_corrected" }>,
  event: UnappliedEvent,
  recordedAt: Date,
): Promise<void> {
  if (correction.registerId !== origin.registerId) {
    throw new Error(
      `a clock correction names register ${correction.registerId}, not the register ${origin.registerId} that pushed it`,
    );
  }
  const [alreadyRecorded] = await tx
    .select({ eventId: clockCorrections.eventId })
    .from(clockCorrections)
    .where(eq(clockCorrections.eventId, event.eventId));
  if (alreadyRecorded) {
    return;
  }
  const observation = clockCorrectedObservation({
    registerId: origin.registerId,
    locationId: origin.locationId,
    pointOfSale: correction.pointOfSale,
    documentType: correction.documentType,
    previousReading: correction.previousReading.toISOString(),
    correctedReading: correction.correctedReading.toISOString(),
    actorId: correction.actorId,
  });
  if (!observation.holds) {
    throw new Error("a clock correction always holds an alert to open");
  }
  const opened = await openAlert(tx, observation.alert, { now: () => recordedAt });
  await tx.insert(clockCorrections).values({
    eventId: event.eventId,
    registerId: origin.registerId,
    pointOfSale: correction.pointOfSale,
    documentType: correction.documentType,
    previousReading: correction.previousReading,
    correctedReading: correction.correctedReading,
    actorId: correction.actorId,
    correctedAt: event.occurredAt,
    alertId: opened.alertId,
    recordedAt,
  });
}
