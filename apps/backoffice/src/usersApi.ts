import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

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
};

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

export type EmailChangeChallenge = {
  reauthenticationOptions: PublicKeyCredentialRequestOptionsJSON;
};

export type FetchEmailChangeChallengeOutcome =
  | { kind: "ok"; value: EmailChangeChallenge }
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
  | { kind: "authentication_failed" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type UserCreationChallenge = {
  reauthenticationOptions: PublicKeyCredentialRequestOptionsJSON;
};

export type FetchUserCreationChallengeOutcome =
  | { kind: "ok"; value: UserCreationChallenge }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
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
  | { kind: "authentication_failed" }
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
  };
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

/** Hands back a fresh reauthentication challenge for creating a user (`POST /users/creation-options`). */
export async function fetchUserCreationChallenge(): Promise<FetchUserCreationChallengeOutcome> {
  let response: Response;
  try {
    response = await postJson("/users/creation-options");
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
    | { reauthentication_options: PublicKeyCredentialRequestOptionsJSON }
    | undefined;
  if (!body) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: { reauthenticationOptions: body.reauthentication_options } };
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

/** Verifies the reauthentication and creates the user in the session's own branch with the chosen role (`POST /users`). */
export async function createUser(
  input: CreateUserInput,
  reauthentication: AuthenticationResponseJSON,
): Promise<CreateUserOutcome> {
  let response: Response;
  try {
    response = await postJson("/users", {
      first_name: input.firstName,
      email: input.email,
      role_id: input.roleId,
      reauthentication,
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
  if (response.status === 401) {
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    return body?.code === "authentication_failed"
      ? { kind: "authentication_failed" }
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

/** Hands back a fresh reauthentication challenge for changing a user's email (`POST /users/:id/email-change-options`). */
export async function fetchEmailChangeChallenge(
  id: string,
): Promise<FetchEmailChangeChallengeOutcome> {
  let response: Response;
  try {
    response = await postJson(`/users/${id}/email-change-options`);
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
    | { reauthentication_options: PublicKeyCredentialRequestOptionsJSON }
    | undefined;
  if (!body) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: { reauthenticationOptions: body.reauthentication_options } };
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

/** Verifies the reauthentication and changes the user's email, rejecting a save over a newer version (`POST /users/:id/email`). */
export async function changeUserEmail(
  id: string,
  input: ChangeUserEmailInput,
  reauthentication: AuthenticationResponseJSON,
): Promise<ChangeUserEmailOutcome> {
  let response: Response;
  try {
    response = await postJson(`/users/${id}/email`, {
      email: input.email,
      version: input.version,
      reauthentication,
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
  if (response.status === 401) {
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    return body?.code === "authentication_failed"
      ? { kind: "authentication_failed" }
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
