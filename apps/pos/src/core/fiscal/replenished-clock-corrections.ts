import { clockCorrectionPeriodKey, replayedClockMark } from "@purosur/domain";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { cashSessionStanding, insertClockCorrection } from "./sqlite-clock-correction";
import { clockMarkOf } from "./sqlite-fiscal-series";
import { upsertClockMark } from "./sqlite-sale-authorization";

type ClockCorrectedFact = Extract<SyncedFact, { kind: "clock_corrected" }>;

function correctionHeld(database: LocalDatabase, { correction }: ClockCorrectedFact): boolean {
  return (
    database
      .prepare(
        `SELECT 1 FROM clock_corrections
         WHERE point_of_sale = ? AND document_type = ?
           AND previous_reading = ? AND corrected_reading = ?`,
      )
      .get(
        correction.pointOfSale,
        correction.documentType,
        correction.previousReading.toISOString(),
        correction.correctedReading.toISOString(),
      ) !== undefined
  );
}

export function applyReplenishedClockCorrection(
  database: LocalDatabase,
  fact: ClockCorrectedFact,
): void {
  if (correctionHeld(database, fact)) {
    return;
  }
  const {
    pointOfSale,
    documentType,
    previousReading,
    previousReadingSource,
    correctedReading,
    registerId,
    actorId,
  } = fact.correction;
  const lowering = {
    pointOfSale,
    documentType,
    previousReading,
    previousReadingSource,
    correctedReading,
  };
  upsertClockMark(database, {
    pointOfSale,
    documentType,
    reading: replayedClockMark(clockMarkOf(database, pointOfSale, documentType), lowering),
  });
  insertClockCorrection(database, {
    period: clockCorrectionPeriodKey(cashSessionStanding(database)),
    registerId,
    actorId,
    lowering,
  });
}
