import { argentinaInstant, type OutboxEventDraft } from "../../shared/index.js";
import type { FiscalDocumentType } from "./fiscal-rejection-standing.js";
import {
  type ClockCorrectionReadings,
  isBeforeTaxAuthorityLastIssuedDay,
  isBehindClockMark,
  isInClockCorrectionLapse,
} from "./register-clock.js";

export const CLOCK_CORRECTED_EVENT_TYPE = "clock_corrected";

export interface ClockMark {
  pointOfSale: number;
  documentType: FiscalDocumentType;
  reading: Date;
}

export const CLOCK_PREVIOUS_READING_SOURCES = ["clock_mark", "tax_authority_day"] as const;

export type ClockPreviousReadingSource = (typeof CLOCK_PREVIOUS_READING_SOURCES)[number];

export interface ClockLowering {
  pointOfSale: number;
  documentType: FiscalDocumentType;
  previousReading: Date;
  previousReadingSource: ClockPreviousReadingSource;
  correctedReading: Date;
}

export interface TaxAuthorityClockFloor {
  pointOfSale: number;
  documentType: FiscalDocumentType;
  lastIssuedOn: string;
  corrections: readonly ClockCorrectionReadings[];
}

function seriesKey({
  pointOfSale,
  documentType,
}: {
  pointOfSale: number;
  documentType: FiscalDocumentType;
}): string {
  return `${pointOfSale}:${documentType}`;
}

export function clockLoweringsFor(
  marks: readonly ClockMark[],
  reading: Date,
  floor: TaxAuthorityClockFloor | null,
): ClockLowering[] {
  const markLowerings = marks
    .filter((mark) => isBehindClockMark(reading, mark.reading))
    .map(
      ({ pointOfSale, documentType, reading: previousReading }): ClockLowering => ({
        pointOfSale,
        documentType,
        previousReading,
        previousReadingSource: "clock_mark",
        correctedReading: reading,
      }),
    );
  if (
    floor === null ||
    !isBeforeTaxAuthorityLastIssuedDay(reading, floor.lastIssuedOn) ||
    isInClockCorrectionLapse({
      reading,
      taxAuthorityLastIssuedOn: floor.lastIssuedOn,
      corrections: floor.corrections,
    })
  ) {
    return markLowerings;
  }
  const startOfTaxAuthorityDay = new Date(argentinaInstant(floor.lastIssuedOn, "00:00"));
  const mark = marks.find((candidate) => seriesKey(candidate) === seriesKey(floor));
  const fromMark = mark !== undefined && mark.reading.getTime() > startOfTaxAuthorityDay.getTime();
  const floorLowering: ClockLowering = {
    pointOfSale: floor.pointOfSale,
    documentType: floor.documentType,
    previousReading: fromMark ? mark.reading : startOfTaxAuthorityDay,
    previousReadingSource: fromMark ? "clock_mark" : "tax_authority_day",
    correctedReading: reading,
  };
  return [
    ...markLowerings.filter((lowering) => seriesKey(lowering) !== seriesKey(floor)),
    floorLowering,
  ];
}

export interface ClockCorrectedFact extends ClockLowering {
  registerId: string;
  actorId: string;
}

export type ClockCorrectionAlertState = "open" | "closed";

export interface CashSessionStanding {
  openSessionId: string | null;
  lastClosedSessionId: string | null;
}

export function clockCorrectionPeriodKey({
  openSessionId,
  lastClosedSessionId,
}: CashSessionStanding): string {
  return openSessionId ?? `after session ${lastClosedSessionId ?? "none"}`;
}

export interface ClockCorrectedEventInput {
  eventId: string;
  registerId: string;
  actorId: string;
  lowering: ClockLowering;
}

export function clockCorrectedEvent({
  eventId,
  registerId,
  actorId,
  lowering,
}: ClockCorrectedEventInput): OutboxEventDraft {
  const correctedReading = lowering.correctedReading.toISOString();
  return {
    event_id: eventId,
    aggregate_type: "CashRegister",
    aggregate_id: registerId,
    event_type: CLOCK_CORRECTED_EVENT_TYPE,
    schema_version: 2,
    payload: {
      point_of_sale: lowering.pointOfSale,
      document_type: lowering.documentType,
      previous_reading: lowering.previousReading.toISOString(),
      previous_reading_source: lowering.previousReadingSource,
      corrected_reading: correctedReading,
    },
    occurred_at: correctedReading,
    actor_id: actorId,
  };
}
