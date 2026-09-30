import {
  type RegisterCreationBody,
  type RegisterSummaryBody,
  registerCoverageSchema,
  registerEnrollmentCodeSchema,
  registerListSchema,
} from "@purosur/contracts";
import type { PermissionKey } from "@purosur/domain";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { retryAfterSeconds } from "../platform/retry-after-seconds";
import { readValidationFailedField } from "../platform/validation-failed-field";

type PendingEnrollmentCode = { issuedAt: string; expiresAt: string };

export type RegisterSummary = {
  id: string;
  name: string;
  pendingCode: PendingEnrollmentCode | null;
};

export type FetchRegistersOutcome = CloudReadOutcome<RegisterSummary[]>;

export type FetchRegisterCoverageOutcome = CloudReadOutcome<PermissionKey[]>;

export type CreateRegisterInput = RegisterCreationBody;

export type CreateRegisterOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "name_taken" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

type EmittedEnrollmentCode = { code: string; expiresAt: string };

export type EmitEnrollmentCodeOutcome =
  | { kind: "ok"; value: EmittedEnrollmentCode }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

function postJson(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function registerFromWire(row: RegisterSummaryBody): RegisterSummary {
  return {
    id: row.id,
    name: row.name,
    pendingCode: row.pending_code
      ? { issuedAt: row.pending_code.issued_at, expiresAt: row.pending_code.expires_at }
      : null,
  };
}

// Every register action is gated by the shared passkey-authorization window: a 401 here means
// either the session ended or that window has lapsed, never a rejected assertion.
type GatedActionErrorOutcome =
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "forbidden" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

async function gatedActionErrorOutcome(response: Response): Promise<GatedActionErrorOutcome> {
  if (response.status === 401) {
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    return body?.code === "authorization_required"
      ? { kind: "authorization_required" }
      : { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
  }
  return { kind: "failed" };
}

async function readCloud<T>(
  path: string,
  fromBody: (body: unknown) => T | undefined,
): Promise<CloudReadOutcome<T>> {
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
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const value = fromBody(await response.json().catch(() => undefined));
  return value === undefined ? { kind: "failed" } : { kind: "ok", value };
}

export function fetchRegisters(): Promise<FetchRegistersOutcome> {
  return readCloud("/api/registers", (body) =>
    registerListSchema.safeParse(body).data?.map(registerFromWire),
  );
}

export function fetchRegisterCoverage(): Promise<FetchRegisterCoverageOutcome> {
  return readCloud(
    "/api/registers/coverage",
    (body) => registerCoverageSchema.safeParse(body).data?.uncovered_permissions,
  );
}

export async function createRegister(input: CreateRegisterInput): Promise<CreateRegisterOutcome> {
  let response: Response;
  try {
    response = await postJson("/api/registers", input);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response);
    return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
  }
  if (response.status === 409) {
    return { kind: "name_taken" };
  }
  return gatedActionErrorOutcome(response);
}

export async function emitEnrollmentCode(id: string): Promise<EmitEnrollmentCodeOutcome> {
  let response: Response;
  try {
    response = await postJson(`/api/registers/${id}/enrollment-code`);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = registerEnrollmentCodeSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    if (!parsed.success) {
      return { kind: "failed" };
    }
    return { kind: "ok", value: { code: parsed.data.code, expiresAt: parsed.data.expires_at } };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  return gatedActionErrorOutcome(response);
}
