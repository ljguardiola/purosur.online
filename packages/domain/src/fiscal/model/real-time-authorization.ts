import { argentinaCalendarDay, SALE_COMPLETED_EVENT_TYPE } from "../../shared/index.js";
import {
  type FiscalOnlineSignalEvidence,
  isRegisterFiscallyOnline,
} from "./fiscal-online-signal.js";
import { type Fortnight, fortnightContaining } from "./offline-authorization-code.js";
import { type NextOfflineNumberInput, nextOfflineNumber } from "./offline-number-block.js";
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

export type FiscalDocumentState =
  | "REQUESTING"
  | "AUTHORIZED"
  | "REJECTED"
  | "UNKNOWN"
  | "RELEASED"
  | "CONFLICTING";

export const SERIES_WAITING_STATES: readonly FiscalDocumentState[] = ["REQUESTING", "UNKNOWN"];

export const IN_PROGRESS_FISCAL_DOCUMENT_STATES: readonly FiscalDocumentState[] = ["REQUESTING"];

export const OUTCOME_UNKNOWN_FISCAL_DOCUMENT_STATES: readonly FiscalDocumentState[] = ["UNKNOWN"];

export const NUMBER_CONSUMING_STATES: readonly FiscalDocumentState[] = [
  "AUTHORIZED",
  "CONFLICTING",
];

export interface RealTimeSeries {
  pointOfSale: number | null;
  localLastAuthorized: number | null;
  taxAuthorityLastAuthorized: number | null;
  documentRequesting: boolean;
  documentUnknown: boolean;
}

export interface OfflineSeries extends NextOfflineNumberInput {
  pointOfSale: number | null;
}

export const OFFLINE_AUTHORIZATION_CAUSES = [
  "no_connectivity",
  "unclear_outcome",
  "numbering_conflict",
] as const;

export type OfflineAuthorizationCause = (typeof OFFLINE_AUTHORIZATION_CAUSES)[number];

type DecidedOfflineCause = Extract<
  OfflineAuthorizationCause,
  "no_connectivity" | "unclear_outcome"
>;

const DEFERRAL_REASON_OF_CAUSE: Record<DecidedOfflineCause, DeferralReason> = {
  no_connectivity: "fiscally_offline",
  unclear_outcome: "document_waiting",
};

export interface SaleAuthorizationRouteInput {
  gate: PreEmissionGateOutcome;
  online: FiscalOnlineSignalEvidence;
  now: Date;
  occurredAt: Date;
  series: RealTimeSeries;
  offlineSeries: OfflineSeries;
  offlineAuthorizationCode: string | null;
}

export type SaleAuthorizationRoute =
  | { kind: "reserve"; pointOfSale: number; number: number; document: FacturaC }
  | {
      kind: "issue_offline";
      cause: DecidedOfflineCause;
      pointOfSale: number;
      number: number;
      document: FacturaC;
      issuedOn: string;
      fortnight: Fortnight;
      offlineAuthorizationCode: string;
    }
  | { kind: "defer"; reason: DeferralReason };

function deferred(reason: DeferralReason): SaleAuthorizationRoute {
  return { kind: "defer", reason };
}

export function invoiceOwnFortnight(occurredAt: Date): Fortnight {
  return fortnightContaining(invoiceDateOf(occurredAt));
}

function offlineRoute(
  cause: DecidedOfflineCause,
  document: FacturaC,
  { occurredAt, offlineSeries, offlineAuthorizationCode }: SaleAuthorizationRouteInput,
): SaleAuthorizationRoute {
  const number = nextOfflineNumber(offlineSeries);
  if (offlineSeries.pointOfSale === null || offlineAuthorizationCode === null || number === null) {
    return deferred(DEFERRAL_REASON_OF_CAUSE[cause]);
  }
  return {
    kind: "issue_offline",
    cause,
    pointOfSale: offlineSeries.pointOfSale,
    number,
    document,
    issuedOn: invoiceDateOf(occurredAt),
    fortnight: invoiceOwnFortnight(occurredAt),
    offlineAuthorizationCode,
  };
}

export function decideSaleAuthorizationRoute(
  input: SaleAuthorizationRouteInput,
): SaleAuthorizationRoute {
  const { gate, online, now, series } = input;
  if (gate.kind === "failed") {
    return deferred("pre_emission_gate_failed");
  }
  if (series.pointOfSale !== null && series.documentUnknown) {
    return offlineRoute("unclear_outcome", gate.document, input);
  }
  if (!isRegisterFiscallyOnline(online, now)) {
    return offlineRoute("no_connectivity", gate.document, input);
  }
  if (series.pointOfSale === null) {
    return deferred("point_of_sale_missing");
  }
  if (series.documentRequesting) {
    return deferred("document_waiting");
  }
  const number = nextInvoiceNumber(series);
  if (number === null) {
    return deferred("tax_authority_count_unknown");
  }
  return { kind: "reserve", pointOfSale: series.pointOfSale, number, document: gate.document };
}

export const REJECTION_CLASSES = ["content", "standing"] as const;

export type RejectionClass = (typeof REJECTION_CLASSES)[number];

export type RealTimeAuthorizationAnswer =
  | { kind: "authorized"; authorizationCode: string; authorizationCodeDueOn: string }
  | { kind: "rejected"; codes: readonly number[]; rejectionClass: RejectionClass }
  | { kind: "not_attempted" }
  | { kind: "unclear" };

const NUMBER_OR_DATE_OUT_OF_ORDER_CODE = 10016;

const INTERNAL_ERROR_CODES: ReadonlySet<number> = new Set([500, 501, 502, 600, 602]);

const STANDING_REJECTION_CODES: ReadonlySet<number> = new Set([10000, 10005, 1005, 601]);

function hasInternalErrorCode(codes: readonly number[]): boolean {
  return codes.some((code) => INTERNAL_ERROR_CODES.has(code));
}

function hasStandingCode(codes: readonly number[], standingCodes: ReadonlySet<number>): boolean {
  return codes.some((code) => standingCodes.has(code));
}

export function taxAuthorityRejectionAnswer(
  codes: readonly number[],
  standingCodes: ReadonlySet<number> = STANDING_REJECTION_CODES,
): RealTimeAuthorizationAnswer {
  if (codes.includes(NUMBER_OR_DATE_OUT_OF_ORDER_CODE) || hasInternalErrorCode(codes)) {
    return { kind: "unclear" };
  }
  return {
    kind: "rejected",
    codes,
    rejectionClass: hasStandingCode(codes, standingCodes) ? "standing" : "content",
  };
}

export function taxAuthorityRefusalAnswer(
  codes: readonly number[],
  standingCodes: ReadonlySet<number> = STANDING_REJECTION_CODES,
): RealTimeAuthorizationAnswer {
  if (hasInternalErrorCode(codes) || !hasStandingCode(codes, standingCodes)) {
    return { kind: "unclear" };
  }
  return { kind: "rejected", codes, rejectionClass: "standing" };
}

export type RealTimeAuthorizationResolution =
  | { state: "AUTHORIZED"; authorizationCode: string; authorizationCodeDueOn: string }
  | { state: "REJECTED"; deferralReason: "rejected" }
  | { state: "UNKNOWN"; deferralReason: "unclear_outcome" };

export function realTimeAuthorizationResolution(
  answer: Extract<RealTimeAuthorizationAnswer, { kind: "unclear" | "not_attempted" }>,
): Extract<RealTimeAuthorizationResolution, { state: "UNKNOWN" }>;
export function realTimeAuthorizationResolution(
  answer: RealTimeAuthorizationAnswer,
): RealTimeAuthorizationResolution;
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
