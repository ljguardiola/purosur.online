import type { OutboxEventDraft } from "../../shared/index.js";
import type { FiscalDocumentType } from "./fiscal-rejection-standing.js";
import { isBehindClockMark } from "./register-clock.js";

export const CLOCK_CORRECTED_EVENT_TYPE = "clock_corrected";

export interface ClockMark {
  pointOfSale: number;
  documentType: FiscalDocumentType;
  reading: Date;
}

export interface ClockLowering {
  pointOfSale: number;
  documentType: FiscalDocumentType;
  previousReading: Date;
  correctedReading: Date;
}

export function clockLoweringsFor(marks: readonly ClockMark[], reading: Date): ClockLowering[] {
  return marks
    .filter((mark) => isBehindClockMark(reading, mark.reading))
    .map(({ pointOfSale, documentType, reading: previousReading }) => ({
      pointOfSale,
      documentType,
      previousReading,
      correctedReading: reading,
    }));
}

export interface ClockCorrectedFact extends ClockLowering {
  registerId: string;
  actorId: string;
}

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
    schema_version: 1,
    payload: {
      point_of_sale: lowering.pointOfSale,
      document_type: lowering.documentType,
      previous_reading: lowering.previousReading.toISOString(),
      corrected_reading: correctedReading,
    },
    occurred_at: correctedReading,
    actor_id: actorId,
  };
}
