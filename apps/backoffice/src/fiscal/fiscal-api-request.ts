import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";

export type WriteFailure =
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export async function readCloudList<Value>(
  path: string,
  valueFrom: (body: unknown) => Value | undefined,
): Promise<CloudReadOutcome<Value>> {
  let response: Response;
  try {
    response = await fetch(path);
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
  const value = valueFrom(await response.json().catch(() => undefined));
  return value === undefined ? { kind: "failed" } : { kind: "ok", value };
}

export async function sendJson(
  method: "POST" | "PUT",
  path: string,
  body: unknown,
): Promise<Response | undefined> {
  try {
    return await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return undefined;
  }
}

export async function errorCodeOf(response: Response): Promise<string | undefined> {
  const body = (await response
    .clone()
    .json()
    .catch(() => undefined)) as { code?: unknown } | undefined;
  return typeof body?.code === "string" ? body.code : undefined;
}

export async function writeFailureOf(response: Response): Promise<WriteFailure> {
  if (response.status === 401) {
    return (await errorCodeOf(response)) === "authorization_required"
      ? { kind: "authorization_required" }
      : { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return rateLimitOutcome(response);
  }
  return { kind: "failed" };
}
