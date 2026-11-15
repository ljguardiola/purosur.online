import type {
  AlertEmailStatusQuery,
  QueriedAlertEmailStatus,
} from "@purosur/domain/alerts/use-cases";
import { getResendEmail } from "../platform/resend-email-api.js";

export interface ResendAlertEmailStatusQueryOptions {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  warn?: (message: string) => void;
}

const UNDELIVERED_EVENTS = new Set(["bounced", "failed", "suppressed", "canceled"]);
const DELIVERED_EVENTS = new Set(["delivered", "opened", "clicked", "complained"]);

function lastEventOf(responseBody: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(responseBody);
    const lastEvent =
      typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "last_event") : undefined;
    return typeof lastEvent === "string" ? lastEvent : undefined;
  } catch {
    return undefined;
  }
}

function statusOf(lastEvent: string): QueriedAlertEmailStatus {
  if (UNDELIVERED_EVENTS.has(lastEvent)) {
    return { kind: "undelivered" };
  }
  return DELIVERED_EVENTS.has(lastEvent) ? { kind: "delivered" } : { kind: "in_transit" };
}

export function createResendAlertEmailStatusQuery(
  options: ResendAlertEmailStatusQueryOptions,
): AlertEmailStatusQuery {
  const warn = options.warn ?? console.warn;
  return {
    async queriedAlertEmailStatus(providerMessageId) {
      const logUnavailable = (reason: string) => {
        warn(`Alert email status not read (provider message ${providerMessageId}): ${reason}`);
        return { kind: "unavailable" } as const;
      };
      try {
        const lastEvent = lastEventOf(await getResendEmail(options, providerMessageId));
        return lastEvent === undefined
          ? logUnavailable("Resend API answered without a last event")
          : statusOf(lastEvent);
      } catch (error) {
        return logUnavailable(error instanceof Error ? error.message : String(error));
      }
    },
  };
}
