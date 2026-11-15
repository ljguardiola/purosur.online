import { alertEmailOptInSchema } from "@purosur/contracts";
import { cloudFetch } from "../platform/cloud-fetch";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";

export type AlertEmailOptIn = { optedInAt: string | null };

export type FetchOwnAlertEmailOptInOutcome = CloudReadOutcome<AlertEmailOptIn>;

export type ChangeOwnAlertEmailOptInOutcome =
  | { kind: "ok"; value: AlertEmailOptIn }
  | { kind: "authorization_required" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type WithdrawUserAlertEmailOptInOutcome =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "own_account" }
  | { kind: "authorization_required" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

const OWN_OPT_IN_PATH = "/api/account/alert-email-opt-in";

async function readOptIn(response: Response): Promise<AlertEmailOptIn | undefined> {
  const parsed = alertEmailOptInSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { optedInAt: parsed.data.opted_in_at } : undefined;
}

async function refusalOf(response: Response) {
  if (response.status === 401) {
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    return body?.code === "authorization_required"
      ? ({ kind: "authorization_required" } as const)
      : ({ kind: "unauthenticated" } as const);
  }
  if (response.status === 403) {
    return { kind: "forbidden" } as const;
  }
  if (response.status === 429) {
    return rateLimitOutcome(response);
  }
  return { kind: "failed" } as const;
}

export async function fetchOwnAlertEmailOptIn(): Promise<FetchOwnAlertEmailOptInOutcome> {
  let response: Response;
  try {
    response = await cloudFetch(OWN_OPT_IN_PATH);
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    const refusal = await refusalOf(response);
    return refusal.kind === "authorization_required" ? { kind: "failed" } : refusal;
  }
  const optIn = await readOptIn(response);
  return optIn === undefined ? { kind: "failed" } : { kind: "ok", value: optIn };
}

async function changeOwnOptIn(method: "PUT" | "DELETE"): Promise<ChangeOwnAlertEmailOptInOutcome> {
  let response: Response;
  try {
    response = await cloudFetch(OWN_OPT_IN_PATH, { method });
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return refusalOf(response);
  }
  const optIn = await readOptIn(response);
  return optIn === undefined ? { kind: "failed" } : { kind: "ok", value: optIn };
}

export function recordOwnAlertEmailOptIn(): Promise<ChangeOwnAlertEmailOptInOutcome> {
  return changeOwnOptIn("PUT");
}

export function withdrawOwnAlertEmailOptIn(): Promise<ChangeOwnAlertEmailOptInOutcome> {
  return changeOwnOptIn("DELETE");
}

export async function withdrawUserAlertEmailOptIn(
  id: string,
): Promise<WithdrawUserAlertEmailOptInOutcome> {
  let response: Response;
  try {
    response = await cloudFetch(`/api/users/${id}/alert-email-opt-in`, { method: "DELETE" });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return (await readOptIn(response)) === undefined ? { kind: "failed" } : { kind: "ok" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 403) {
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    return body?.code === "own_account" ? { kind: "own_account" } : { kind: "forbidden" };
  }
  return refusalOf(response);
}
