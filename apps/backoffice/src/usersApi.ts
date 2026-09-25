// The backoffice API rate limiter counts a rolling one-hour window, the same fallback
// passkeyApi.ts's own rate-limited outcomes fall back to.
const RATE_LIMIT_FALLBACK_SECONDS = 60 * 60;

export type BranchUserRole = { id: string; isAdministrator: boolean; name: string | null };

export type BranchUser = {
  id: string;
  firstName: string;
  email: string;
  version: number;
  role: BranchUserRole;
  passkeyCount: number;
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

export type ChangeUserEmailInput = { email: string; version: number };

export type ChangeUserEmailFieldError = "email" | "version";

export type ChangeUserEmailOutcome =
  | { kind: "ok"; value: BranchUser }
  | { kind: "validation_failed"; field: ChangeUserEmailFieldError }
  | { kind: "email_taken" }
  | { kind: "stale_version" }
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

function userFromWire(row: {
  id: string;
  first_name: string;
  email: string;
  version: number;
  role: { id: string; is_administrator: boolean; name: string | null };
  passkey_count: number;
}): BranchUser {
  return {
    id: row.id,
    firstName: row.first_name,
    email: row.email,
    version: row.version,
    role: {
      id: row.role.id,
      isAdministrator: row.role.is_administrator,
      name: row.role.name,
    },
    passkeyCount: row.passkey_count,
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

/** Lists the session branch's users with their role, Administrator only (`GET /users`). */
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

// Every sensitive user action is gated by the shared passkey-authorization window
// (`passkey-authorization-guard.ts`) instead of its own step-up, so a 401 here means either the
// session ended or that window has lapsed, never a rejected assertion.
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

/**
 * Creates the user in the session's own branch with the chosen role, gated by the shared
 * passkey-authorization window instead of its own reauthentication step-up (`POST /users`).
 */
export async function createUser(input: CreateUserInput): Promise<CreateUserOutcome> {
  let response: Response;
  try {
    response = await postJson("/users", {
      first_name: input.firstName,
      email: input.email,
      role_id: input.roleId,
    });
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
    return { kind: "email_taken" };
  }
  return gatedActionErrorOutcome(response);
}

/** Reads one branch user by id, Administrator only (`GET /users/:id`). */
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

function emailChangeFieldFromWire(field: unknown): ChangeUserEmailFieldError | undefined {
  if (field === "email") {
    return "email";
  }
  if (field === "version") {
    return "version";
  }
  return undefined;
}

/**
 * Changes the user's email, rejecting a save over a newer version, gated by the shared
 * passkey-authorization window instead of its own reauthentication step-up
 * (`POST /users/:id/email`).
 */
export async function changeUserEmail(
  id: string,
  input: ChangeUserEmailInput,
): Promise<ChangeUserEmailOutcome> {
  let response: Response;
  try {
    response = await postJson(`/users/${id}/email`, {
      email: input.email,
      version: input.version,
    });
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
      const field = emailChangeFieldFromWire(body.details?.[0]?.field);
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
    return body?.code === "stale_version" ? { kind: "stale_version" } : { kind: "email_taken" };
  }
  return gatedActionErrorOutcome(response);
}

async function forbiddenOrOwnAccount(
  response: Response,
): Promise<{ kind: "forbidden" } | { kind: "own_account" }> {
  const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
  return body?.code === "own_account" ? { kind: "own_account" } : { kind: "forbidden" };
}

/** Lists one branch user's passkeys, oldest first, Administrator only (`GET /users/:id/passkeys`). */
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

/**
 * Removes the target user's named passkey, ending every backoffice session they have open, gated
 * by the shared passkey-authorization window (against the Administrator's own passkeys, never the
 * target's) instead of its own reauthentication step-up
 * (`POST /users/:id/passkeys/:passkeyId/remove`).
 */
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
