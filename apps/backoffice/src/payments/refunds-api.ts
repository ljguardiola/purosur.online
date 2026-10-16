import {
  type ConfirmedRefundBody,
  confirmedRefundSchema,
  discardedRefundSchema,
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
  | { kind: "discarded" }
  | RequestRefusal;

export type DiscardRefundOutcome =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "not_discardable" }
  | { kind: "already_done" }
  | { kind: "already_discarded" }
  | { kind: "already_confirmed" }
  | RequestRefusal;

export type ConfirmRefundOutcome =
  | { kind: "ok"; value: ConfirmedRefundBody }
  | { kind: "not_found" }
  | { kind: "not_confirmable" }
  | { kind: "already_done" }
  | { kind: "already_confirmed" }
  | { kind: "not_backed" }
  | { kind: "exceeds_refundable" }
  | { kind: "not_configured" }
  | RequestRefusal;

const CONFIRM_CONFLICTS = {
  refund_not_confirmable: "not_confirmable",
  already_done: "already_done",
  already_confirmed: "already_confirmed",
  refund_not_backed: "not_backed",
  exceeds_refundable: "exceeds_refundable",
} as const;

async function conflictCode(response: Response): Promise<string | undefined> {
  const body = (await response.json().catch(() => undefined)) as { code?: unknown } | undefined;
  return typeof body?.code === "string" ? body.code : undefined;
}

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
    const code = await conflictCode(response);
    if (code === "already_done") {
      return { kind: "already_done" };
    }
    return code === "refund_discarded" ? { kind: "discarded" } : { kind: "failed" };
  }
  return refusal(response);
}

export async function discardRefund(refundId: string): Promise<DiscardRefundOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/refunds/${refundId}/discard`, { method: "POST" });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = discardedRefundSchema.safeParse(await response.json().catch(() => undefined));
    return parsed.success ? { kind: "ok" } : { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const code = await conflictCode(response);
    if (code === "refund_not_discardable") {
      return { kind: "not_discardable" };
    }
    if (code === "already_done" || code === "already_discarded") {
      return { kind: code };
    }
    if (code === "refund_already_confirmed") {
      return { kind: "already_confirmed" };
    }
    return { kind: "failed" };
  }
  return refusal(response);
}

export async function confirmRefund(refundId: string): Promise<ConfirmRefundOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/refunds/${refundId}/confirmation`, { method: "POST" });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = confirmedRefundSchema.safeParse(await response.json().catch(() => undefined));
    return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const code = await conflictCode(response);
    const kind = Object.entries(CONFIRM_CONFLICTS).find(([conflict]) => conflict === code)?.[1];
    return kind ? { kind } : { kind: "failed" };
  }
  if (response.status === 503) {
    return (await conflictCode(response)) === "payment_provider_not_configured"
      ? { kind: "not_configured" }
      : { kind: "failed" };
  }
  return refusal(response);
}
