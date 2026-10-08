import {
  type BranchUserWire,
  branchUserListSchema,
  branchUserSchema,
  type UserCreationBody,
  type UserEditBody,
  userPinCodeSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { type Passkey, passkeyListFromWire } from "../platform/passkey-list";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type BranchUser = ReturnType<typeof userFromWire>;

export type BranchUserRole = BranchUser["role"];

export type FetchUserPasskeysOutcome = CloudReadOutcome<Passkey[]> | { kind: "not_found" };

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

export type EmitUserPinCodeOutcome =
  | { kind: "ok"; value: { code: string; expiresAt: string } }
  | { kind: "not_found" }
  | { kind: "inactive" }
  | { kind: "authorization_required" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type FetchUsersOutcome = CloudReadOutcome<BranchUser[]>;

export type FetchUserOutcome = CloudReadOutcome<BranchUser> | { kind: "not_found" };

export type EditUserOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "email_taken" }
  | { kind: "stale_version" }
  | { kind: "last_administrator" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type CreateUserOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "unknown_role" }
  | { kind: "email_taken" }
  // Distinct from `email_taken`: this account can be reactivated instead of created anew.
  | { kind: "email_belongs_to_deactivated_user"; id: string; name: string }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

function sendJson(method: "POST" | "PUT", path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function postJson(path: string, body: unknown): Promise<Response> {
  return sendJson("POST", path, body);
}

function userFromWire(row: BranchUserWire) {
  return {
    id: row.id,
    firstName: row.first_name,
    email: row.email,
    version: row.version,
    // Absent unless the caller may see deactivated users.
    ...(row.active !== undefined ? { active: row.active } : {}),
    role: {
      id: row.role.id,
      isAdministrator: row.role.is_administrator,
      name: row.role.name,
    },
    passkeyCount: row.passkey_count,
    // The server refuses to change the role regardless, so callers lock that field on this.
    isLastActiveAdministrator: row.is_last_active_administrator,
    mayEmitPinCode: row.may_emit_pin_code,
    mayEdit: row.may_edit,
    mayDeactivate: row.may_deactivate,
    mayReactivate: row.may_reactivate,
    mayRemovePasskey: row.may_remove_passkey,
  };
}

export async function fetchUsers(): Promise<FetchUsersOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/users");
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
  const parsed = branchUserListSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: parsed.data.map(userFromWire) };
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
    return rateLimitOutcome(response);
  }
  return { kind: "failed" };
}

export async function createUser(input: UserCreationBody): Promise<CreateUserOutcome> {
  let response: Response;
  try {
    response = await postJson("/api/users", input);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response.clone());
    if (field !== undefined) {
      return { kind: "validation_failed", field };
    }
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
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
    response = await fetch(`/api/users/${id}`);
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
    return rateLimitOutcome(response);
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const parsed = branchUserSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: userFromWire(parsed.data) };
}

export async function editUser(id: string, input: UserEditBody): Promise<EditUserOutcome> {
  let response: Response;
  try {
    response = await sendJson("PUT", `/api/users/${id}`, input);
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

// Oldest first.
export async function fetchUserPasskeys(id: string): Promise<FetchUserPasskeysOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/users/${id}/passkeys`);
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
    return rateLimitOutcome(response);
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const passkeys = passkeyListFromWire(await response.json().catch(() => undefined));
  if (!passkeys) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: passkeys };
}

// Authorization runs against the Administrator's own passkeys, never the target's.
export async function removeUserPasskey(
  id: string,
  passkeyId: string,
): Promise<RemoveUserPasskeyOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/users/${id}/passkeys/${passkeyId}`, { method: "DELETE" });
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

// The cloud answers the same `not_found` for a missing, other-branch, already-inactive, or Administrator target.
export async function deactivateUser(id: string): Promise<DeactivateUserOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/users/${id}/deactivation`, { method: "PUT" });
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

// The cloud answers the same `not_found` for a missing, other-branch, or already-active target.
export async function reactivateUser(id: string): Promise<ReactivateUserOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/users/${id}/deactivation`, { method: "DELETE" });
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

export async function emitUserPinCode(id: string): Promise<EmitUserPinCodeOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/users/${id}/pin-codes`, { method: "POST" });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = userPinCodeSchema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) {
      return { kind: "failed" };
    }
    return { kind: "ok", value: { code: parsed.data.code, expiresAt: parsed.data.expires_at } };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    return body?.code === "user_inactive" ? { kind: "inactive" } : { kind: "failed" };
  }
  return gatedActionErrorOutcome(response);
}
