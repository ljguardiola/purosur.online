// The backoffice API rate limiter counts a rolling one-hour window, the same fallback
// categoriesApi.ts's own rate-limited outcomes fall back to.
const RATE_LIMIT_FALLBACK_SECONDS = 60 * 60;

export type PendingEnrollmentCode = { issuedAt: string; expiresAt: string };

export type RegisterSummary = {
  id: string;
  name: string;
  pendingCode: PendingEnrollmentCode | null;
};

export type FetchRegistersOutcome =
  | { kind: "ok"; value: RegisterSummary[] }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type CreateRegisterInput = { name: string };

export type CreateRegisterFieldError = "name";

export type CreatedRegister = { id: string; name: string };

export type CreateRegisterOutcome =
  | { kind: "ok"; value: CreatedRegister }
  | { kind: "validation_failed"; field: CreateRegisterFieldError }
  | { kind: "name_taken" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type EmittedEnrollmentCode = { code: string; expiresAt: string };

export type EmitEnrollmentCodeOutcome =
  | { kind: "ok"; value: EmittedEnrollmentCode }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

function retryAfterSeconds(response: Response): number {
  const header = response.headers.get("Retry-After");
  const seconds = header ? Number(header) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : RATE_LIMIT_FALLBACK_SECONDS;
}

function postJson(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function registerFromWire(row: {
  id: string;
  name: string;
  pending_code: { issued_at: string; expires_at: string } | null;
}): RegisterSummary {
  return {
    id: row.id,
    name: row.name,
    pendingCode: row.pending_code
      ? { issuedAt: row.pending_code.issued_at, expiresAt: row.pending_code.expires_at }
      : null,
  };
}

// Every register action is gated by the shared passkey-authorization window
// (`passkey-authorization-guard.ts` on the cloud), the same combination `usersApi.ts`'s own
// gated actions use, so a 401 here means either the session ended or that window has lapsed,
// never a rejected assertion.
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

/** Lists every register of the session's own branch, gated by `enroll_register_devices` (`GET /registers`). */
export async function fetchRegisters(): Promise<FetchRegistersOutcome> {
  let response: Response;
  try {
    response = await fetch("/registers");
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
  const body = (await response.json().catch(() => undefined)) as
    | Parameters<typeof registerFromWire>[0][]
    | undefined;
  if (!Array.isArray(body)) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: body.map(registerFromWire) };
}

/**
 * Creates a register in the session's own branch ("Nueva caja"), gated by
 * `enroll_register_devices` and the shared passkey-authorization window (`POST /registers`).
 */
export async function createRegister(input: CreateRegisterInput): Promise<CreateRegisterOutcome> {
  let response: Response;
  try {
    response = await postJson("/registers", { name: input.name });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const body = (await response.json().catch(() => undefined)) as CreatedRegister | undefined;
    if (!body) {
      return { kind: "failed" };
    }
    return { kind: "ok", value: body };
  }
  if (response.status === 400) {
    const body = (await response.json().catch(() => undefined)) as
      | { code?: string; details?: Array<{ field?: string }> }
      | undefined;
    if (body?.code === "validation_failed" && body.details?.[0]?.field === "name") {
      return { kind: "validation_failed", field: "name" };
    }
    return { kind: "failed" };
  }
  if (response.status === 409) {
    return { kind: "name_taken" };
  }
  return gatedActionErrorOutcome(response);
}

/**
 * Emits a fresh, single-use enrollment code for one register, gated by `enroll_register_devices`
 * and the shared passkey-authorization window (`POST /registers/:id/enrollment-code`).
 */
export async function emitEnrollmentCode(id: string): Promise<EmitEnrollmentCodeOutcome> {
  let response: Response;
  try {
    response = await postJson(`/registers/${id}/enrollment-code`);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | { code?: unknown; expires_at?: unknown }
      | undefined;
    if (typeof body?.code !== "string" || typeof body.expires_at !== "string") {
      return { kind: "failed" };
    }
    return { kind: "ok", value: { code: body.code, expiresAt: body.expires_at } };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  return gatedActionErrorOutcome(response);
}
