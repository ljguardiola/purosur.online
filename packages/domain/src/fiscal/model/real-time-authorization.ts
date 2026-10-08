import { argentinaCalendarDay } from "../../shared/index.js";
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
