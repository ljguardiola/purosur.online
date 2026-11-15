import type {
  AlertEmailStatusQuery,
  QueriedAlertEmailStatus,
} from "@purosur/domain/alerts/use-cases";
import { getResendEmail } from "../platform/resend-email-api.js";
import { ALERT_EMAIL_DELIVERY_TAG } from "./resend-alert-email-sender.js";

export interface ResendAlertEmailStatusQueryOptions {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  warn?: (message: string) => void;
}

function fieldOf(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, name) : undefined;
}

function alertDeliveryIdOf(tags: unknown): string | null {
  if (!Array.isArray(tags)) {
    return null;
  }
  const value = fieldOf(
    tags.find((tag) => fieldOf(tag, "name") === ALERT_EMAIL_DELIVERY_TAG),
    "value",
  );
  return typeof value === "string" ? value : null;
}

function answerOf(responseBody: string): QueriedAlertEmailStatus | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    return undefined;
  }
  const lastEvent = fieldOf(parsed, "last_event");
  return typeof lastEvent === "string"
    ? {
        kind: "answered",
        status: lastEvent,
        alertDeliveryId: alertDeliveryIdOf(fieldOf(parsed, "tags")),
      }
    : undefined;
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
        return (
          answerOf(await getResendEmail(options, providerMessageId)) ??
          logUnavailable("Resend API answered without a last event")
        );
      } catch (error) {
        return logUnavailable(error instanceof Error ? error.message : String(error));
      }
    },
  };
}
