import type { UserCreationBody, UserEditBody } from "@purosur/contracts";

const ROLLING_HOUR_RATE_LIMIT_FALLBACK_SECONDS = 60 * 60;

export type BranchUserRole = { id: string; isAdministrator: boolean; name: string | null };

export type BranchUser = {
  id: string;
  firstName: string;
  email: string;
  version: number;
  /** Wire omits this field entirely unless the caller may see a deactivated user. */
  active?: boolean;
  role: BranchUserRole;
  passkeyCount: number;
  /** The server refuses to change the role regardless, so callers lock that field on this. */
  isLastActiveAdministrator: boolean;
};

export type UserPasskey = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type FetchUserPasskeysOutcome =
  | { kind: "ok"; value: UserPasskey[] }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type RemoveUserPasskeyOutcome =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "own_account" }
  | { kind: "authorization_required" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type DeactivateUserOutcome =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "authorization_required" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type ReactivateUserOutcome =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "authorization_required" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type FetchUsersOutcome =
  | { kind: "ok"; value: BranchUser[] }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type FetchUserOutcome =
  | { kind: "ok"; value: BranchUser }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type EditUserInput = { email: string; roleId: string; version: number };

type EditUserFieldError = "email" | "roleId" | "version";

export type EditUserOutcome =
  | { kind: "ok"; value: BranchUser }
  | { kind: "validation_failed"; field: EditUserFieldError }
  | { kind: "email_taken" }
  | { kind: "stale_version" }
  | { kind: "last_administrator" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type CreateUserInput = { firstName: string; email: string; roleId: string };

export type CreateUserFieldError = "firstName" | "email" | "roleId";

export type CreateUserOutcome =
  | { kind: "ok"; value: BranchUser }
  | { kind: "validation_failed"; field: CreateUserFieldError }
  | { kind: "unknown_role" }
  | { kind: "email_taken" }
  /** Distinct from `email_taken`: this account can be reactivated instead of created anew. */
  | { kind: "email_belongs_to_deactivated_user"; id: string; name: string }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

function retryAfterSeconds(response: Response): number {
  const header = response.headers.get("Retry-After");
  const seconds = header ? Number(header) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0
    ? seconds
    : ROLLING_HOUR_RATE_LIMIT_FALLBACK_SECONDS;
}

function postJson(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function userFromWire(row: {
  id: string;
  first_name: string;
  email: string;
  version: number;
  active?: boolean;
  role: { id: string; is_administrator: boolean; name: string | null };
  passkey_count: number;
  is_last_active_administrator: boolean;
}): BranchUser {
  return {
    id: row.id,
    firstName: row.first_name,
    email: row.email,
    version: row.version,
    ...(row.active !== undefined ? { active: row.active } : {}),
    role: {
      id: row.role.id,
      isAdministrator: row.role.is_administrator,
      name: row.role.name,
    },
    passkeyCount: row.passkey_count,
    isLastActiveAdministrator: row.is_last_active_administrator,
  };
}

function userPasskeyFromRow(row: {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}): UserPasskey {
  return { id: row.id, name: row.name, createdAt: row.created_at, lastUsedAt: row.last_used_at };
}

export async function fetchUsers(): Promise<FetchUsersOutcome> {
  let response: Response;
  try {
    response = await fetch("/users");
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
    | Array<Parameters<typeof userFromWire>[0]>
    | undefined;
  if (!Array.isArray(body)) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: body.map(userFromWire) };
}

function fieldFromWire(field: unknown): CreateUserFieldError | undefined {
  if (field === "first_name") {
    return "firstName";
  }
  if (field === "email") {
    return "email";
  }
  if (field === "role_id") {
    return "roleId";
  }
  return undefined;
}

type GatedActionErrorOutcome =
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "forbidden" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

// Gated by the shared passkey-authorization window instead of a per-action step-up, so a 401
// here means either the session ended or that window has lapsed, never a rejected assertion.
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

export async function createUser(input: CreateUserInput): Promise<CreateUserOutcome> {
  const requestBody: UserCreationBody = {
    first_name: input.firstName,
    email: input.email,
    role_id: input.roleId,
  };
  let response: Response;
  try {
    response = await postJson("/users", requestBody);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | Parameters<typeof userFromWire>[0]
      | undefined;
    if (!body) {
      return { kind: "failed" };
    }
    return { kind: "ok", value: userFromWire(body) };
  }
  if (response.status === 400) {
    const body = (await response.json().catch(() => undefined)) as
      | { code?: string; details?: Array<{ field?: string }> }
      | undefined;
    if (body?.code === "validation_failed") {
      const field = fieldFromWire(body.details?.[0]?.field);
      if (field) {
        return { kind: "validation_failed", field };
      }
    }
    if (body?.code === "unknown_role") {
      return { kind: "unknown_role" };
    }
    return { kind: "failed" };
  }
  if (response.status === 409) {
    const body = (await response.json().catch(() => undefined)) as
      | { code?: string; id?: string; name?: string }
      | undefined;
    if (body?.code === "email_belongs_to_deactivated_user" && body.id && body.name) {
      return { kind: "email_belongs_to_deactivated_user", id: body.id, name: body.name };
    }
    return { kind: "email_taken" };
  }
  return gatedActionErrorOutcome(response);
}

export async function fetchUser(id: string): Promise<FetchUserOutcome> {
  let response: Response;
  try {
    response = await fetch(`/users/${id}`);
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 429) {
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const body = (await response.json().catch(() => undefined)) as
    | Parameters<typeof userFromWire>[0]
    | undefined;
  if (!body) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: userFromWire(body) };
}

function editFieldFromWire(field: unknown): EditUserFieldError | undefined {
  if (field === "email") {
    return "email";
  }
  if (field === "role_id") {
    return "roleId";
  }
  if (field === "version") {
    return "version";
  }
  return undefined;
}

export async function editUser(id: string, input: EditUserInput): Promise<EditUserOutcome> {
  const requestBody: UserEditBody = {
    email: input.email,
    role_id: input.roleId,
    version: input.version,
  };
  let response: Response;
  try {
    response = await postJson(`/users/${id}/edit`, requestBody);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | Parameters<typeof userFromWire>[0]
      | undefined;
    if (!body) {
      return { kind: "failed" };
    }
    return { kind: "ok", value: userFromWire(body) };
  }
  if (response.status === 400) {
    const body = (await response.json().catch(() => undefined)) as
      | { code?: string; details?: Array<{ field?: string }> }
      | undefined;
    if (body?.code === "validation_failed") {
      const field = editFieldFromWire(body.details?.[0]?.field);
      if (field) {
        return { kind: "validation_failed", field };
      }
    }
    return { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    if (body?.code === "stale_version") {
      return { kind: "stale_version" };
    }
    if (body?.code === "last_administrator") {
      return { kind: "last_administrator" };
    }
    return { kind: "email_taken" };
  }
  return gatedActionErrorOutcome(response);
}

async function forbiddenOrOwnAccount(
  response: Response,
): Promise<{ kind: "forbidden" } | { kind: "own_account" }> {
  const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
  return body?.code === "own_account" ? { kind: "own_account" } : { kind: "forbidden" };
}

/** Oldest first. */
export async function fetchUserPasskeys(id: string): Promise<FetchUserPasskeysOutcome> {
  let response: Response;
  try {
    response = await fetch(`/users/${id}/passkeys`);
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 429) {
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const body = (await response.json().catch(() => undefined)) as
    | Array<Parameters<typeof userPasskeyFromRow>[0]>
    | undefined;
  if (!Array.isArray(body)) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: body.map(userPasskeyFromRow) };
}

/** Authorization runs against the Administrator's own passkeys, never the target's. */
export async function removeUserPasskey(
  id: string,
  passkeyId: string,
): Promise<RemoveUserPasskeyOutcome> {
  let response: Response;
  try {
    response = await postJson(`/users/${id}/passkeys/${passkeyId}/remove`);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 403) {
    return forbiddenOrOwnAccount(response);
  }
  return gatedActionErrorOutcome(response);
}

/** The cloud answers the same `not_found` for a malformed, missing, other-branch, already-inactive, or Administrator target. */
export async function deactivateUser(id: string): Promise<DeactivateUserOutcome> {
  let response: Response;
  try {
    response = await postJson(`/users/${id}/deactivation`);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  return gatedActionErrorOutcome(response);
}

/** The cloud answers the same `not_found` for a malformed, missing, other-branch, or already-active target. */
export async function reactivateUser(id: string): Promise<ReactivateUserOutcome> {
  let response: Response;
  try {
    response = await postJson(`/users/${id}/reactivation`);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  return gatedActionErrorOutcome(response);
}
