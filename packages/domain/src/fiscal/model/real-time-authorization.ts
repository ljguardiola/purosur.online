import { argentinaCalendarDay, SALE_COMPLETED_EVENT_TYPE } from "../../shared/index.js";
import {
  type FiscalOnlineSignalEvidence,
  isRegisterFiscallyOnline,
} from "./fiscal-online-signal.js";
import type { FacturaC, PreEmissionGateOutcome } from "./pre-emission-gate.js";

export const REAL_TIME_AUTHORIZATION_TIMEOUT_MS = 5_000;
export const AUTHORIZATION_CALL_MARGIN_MS = 500;
export const ROUND_TRIP_SAMPLE_SIZE = 12;

export function medianRoundTripMs(samples: readonly number[]): number | null {
  const recent = samples.slice(-ROUND_TRIP_SAMPLE_SIZE).sort((a, b) => a - b);
  if (recent.length === 0) {
    return null;
  }
  const middle = Math.floor(recent.length / 2);
  if (recent.length % 2 === 1) {
    return recent[middle] as number;
  }
  return Math.round(((recent[middle - 1] as number) + (recent[middle] as number)) / 2);
}

export interface AuthorizationCallDeadlineInput {
  receivedAt: Date;
  timeoutMs: number;
  roundTripMedianMs: number;
}

export function authorizationCallDeadline({
  receivedAt,
  timeoutMs,
  roundTripMedianMs,
}: AuthorizationCallDeadlineInput): Date {
  return new Date(
    Math.floor(
      receivedAt.getTime() + timeoutMs - AUTHORIZATION_CALL_MARGIN_MS - roundTripMedianMs / 2,
    ),
  );
}

export function mayStartAuthorizationCall(deadline: Date, now: Date): boolean {
  return now.getTime() <= deadline.getTime();
}

export interface NextInvoiceNumberInput {
  localLastAuthorized: number | null;
  taxAuthorityLastAuthorized: number | null;
}

export function nextInvoiceNumber({
  localLastAuthorized,
  taxAuthorityLastAuthorized,
}: NextInvoiceNumberInput): number | null {
  if (taxAuthorityLastAuthorized === null) {
    return null;
  }
  return Math.max(localLastAuthorized ?? 0, taxAuthorityLastAuthorized) + 1;
}

export function invoiceDateOf(completedAt: Date): string {
  return argentinaCalendarDay(completedAt);
}

export const DEFERRAL_REASONS = [
  "pre_emission_gate_failed",
  "fiscally_offline",
  "point_of_sale_missing",
  "document_waiting",
  "tax_authority_count_unknown",
  "rejected",
  "unclear_outcome",
] as const;

export type DeferralReason = (typeof DEFERRAL_REASONS)[number];

export type FiscalDocumentState = "REQUESTING" | "AUTHORIZED" | "REJECTED" | "UNKNOWN";

export const SERIES_WAITING_STATES: readonly FiscalDocumentState[] = ["REQUESTING", "UNKNOWN"];

export const NUMBER_CONSUMING_STATES: readonly FiscalDocumentState[] = ["AUTHORIZED"];

export interface RealTimeSeries {
  pointOfSale: number | null;
  localLastAuthorized: number | null;
  taxAuthorityLastAuthorized: number | null;
  documentWaiting: boolean;
}

export interface RealTimeAuthorizationDecisionInput {
  gate: PreEmissionGateOutcome;
  online: FiscalOnlineSignalEvidence;
  now: Date;
  series: RealTimeSeries;
}

export type RealTimeAuthorizationDecision =
  | { kind: "reserve"; pointOfSale: number; number: number; document: FacturaC }
  | { kind: "defer"; reason: DeferralReason };

function deferred(reason: DeferralReason): RealTimeAuthorizationDecision {
  return { kind: "defer", reason };
}

export function decideRealTimeAuthorization({
  gate,
  online,
  now,
  series,
}: RealTimeAuthorizationDecisionInput): RealTimeAuthorizationDecision {
  if (gate.kind === "failed") {
    return deferred("pre_emission_gate_failed");
  }
  if (!isRegisterFiscallyOnline(online, now)) {
    return deferred("fiscally_offline");
  }
  if (series.pointOfSale === null) {
    return deferred("point_of_sale_missing");
  }
  if (series.documentWaiting) {
    return deferred("document_waiting");
  }
  const number = nextInvoiceNumber(series);
  if (number === null) {
    return deferred("tax_authority_count_unknown");
  }
  return { kind: "reserve", pointOfSale: series.pointOfSale, number, document: gate.document };
}

export type RealTimeAuthorizationAnswer =
  | { kind: "authorized"; authorizationCode: string; authorizationCodeDueOn: string }
  | { kind: "rejected"; codes: readonly number[] }
  | { kind: "not_attempted" }
  | { kind: "unclear" };

const NUMBER_OR_DATE_OUT_OF_ORDER_CODE = 10016;

export function taxAuthorityRejectionAnswer(codes: readonly number[]): RealTimeAuthorizationAnswer {
  if (codes.includes(NUMBER_OR_DATE_OUT_OF_ORDER_CODE)) {
    return { kind: "unclear" };
  }
  return { kind: "rejected", codes };
}

export type RealTimeAuthorizationResolution =
  | { state: "AUTHORIZED"; authorizationCode: string; authorizationCodeDueOn: string }
  | { state: "REJECTED"; deferralReason: "rejected" }
  | { state: "UNKNOWN"; deferralReason: "unclear_outcome" };

export function realTimeAuthorizationResolution(
  answer: RealTimeAuthorizationAnswer,
): RealTimeAuthorizationResolution {
  switch (answer.kind) {
    case "authorized":
      return {
        state: "AUTHORIZED",
        authorizationCode: answer.authorizationCode,
        authorizationCodeDueOn: answer.authorizationCodeDueOn,
      };
    case "rejected":
      return { state: "REJECTED", deferralReason: "rejected" };
    case "not_attempted":
    case "unclear":
      return { state: "UNKNOWN", deferralReason: "unclear_outcome" };
  }
}

export function isCompletionEventOfSale(
  event: { event_type: string; aggregate_id: string },
  saleId: string,
): boolean {
  return event.event_type === SALE_COMPLETED_EVENT_TYPE && event.aggregate_id === saleId;
}
