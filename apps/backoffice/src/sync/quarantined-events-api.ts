import {
  type QuarantinedEventsList,
  quarantinedEventsListSchema,
  releaseQuarantinedEventErrorSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";

export type QuarantinedEvent = QuarantinedEventsList["events"][number];

export type FetchQuarantinedEventsOutcome = CloudReadOutcome<QuarantinedEventsList>;

export type ReleaseQuarantinedEventOutcome =
  | { kind: "ok" }
  | { kind: "not_quarantined" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export async function fetchQuarantinedEvents(): Promise<FetchQuarantinedEventsOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/synced-events/quarantined");
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return rateLimitOutcome(response);
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const parsed = quarantinedEventsListSchema.safeParse(
    await response.json().catch(() => undefined),
  );
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}

async function refusedReleaseOutcome(
  response: Response,
  expectedCode: "not_found" | "not_quarantined",
): Promise<ReleaseQuarantinedEventOutcome> {
  const parsed = releaseQuarantinedEventErrorSchema.safeParse(
    await response.json().catch(() => undefined),
  );
  return parsed.success && parsed.data.code === expectedCode
    ? { kind: expectedCode }
    : { kind: "failed" };
}

export async function releaseQuarantinedEvent(
  eventId: string,
): Promise<ReleaseQuarantinedEventOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/synced-events/${eventId}/release`, { method: "POST" });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 404) {
    return refusedReleaseOutcome(response, "not_found");
  }
  if (response.status === 409) {
    return refusedReleaseOutcome(response, "not_quarantined");
  }
  if (response.status === 429) {
    return rateLimitOutcome(response);
  }
  return { kind: "failed" };
}
