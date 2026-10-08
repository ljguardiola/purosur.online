import {
  markedRefundDoneSchema,
  type PendingRefundsBody,
  pendingRefundsSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";

type RequestRefusal =
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type MarkRefundDoneOutcome =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "already_done" }
  | RequestRefusal;

function refusal(response: Response): RequestRefusal {
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return rateLimitOutcome(response);
  }
  return { kind: "failed" };
}

export async function fetchPendingRefunds(): Promise<CloudReadOutcome<PendingRefundsBody>> {
  let response: Response;
  try {
    response = await fetch("/api/refunds/pending");
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return refusal(response);
  }
  const parsed = pendingRefundsSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}

export async function markRefundDone(refundId: string): Promise<MarkRefundDoneOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/refunds/${refundId}/completion`, { method: "POST" });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = markedRefundDoneSchema.safeParse(await response.json().catch(() => undefined));
    return parsed.success ? { kind: "ok" } : { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    return { kind: "already_done" };
  }
  return refusal(response);
}
