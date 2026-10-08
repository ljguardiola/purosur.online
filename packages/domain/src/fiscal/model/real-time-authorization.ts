import { argentinaCalendarDay } from "../../shared/index.js";

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
