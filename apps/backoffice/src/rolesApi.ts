// The backoffice API rate limiter counts a rolling one-hour window, the same fallback
// usersApi.ts's own rate-limited outcomes fall back to.
const RATE_LIMIT_FALLBACK_SECONDS = 60 * 60;

export type RoleSummary = {
  id: string;
  name: string | null;
  isAdministrator: boolean;
  permissionKeys: string[];
  userCount: number;
};

export type FetchRolesOutcome =
  | { kind: "ok"; value: RoleSummary[] }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type CreateRoleInput = { name: string; permissionKeys: string[] };

export type CreateRoleFieldError = "name" | "permissions";

export type CreateRoleOutcome =
  | { kind: "ok"; value: RoleSummary }
  | { kind: "validation_failed"; field: CreateRoleFieldError }
  | { kind: "name_taken" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type AssignedUser = { id: string; name: string };

export type RoleDetail = RoleSummary & { version: number; assignedUsers: AssignedUser[] };

export type FetchRoleOutcome =
  | { kind: "ok"; value: RoleDetail }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type EditRoleInput = { name: string; permissionKeys: string[]; version: number };

export type EditRoleFieldError = "name" | "permissions" | "version";

export type EditRoleOutcome =
  | { kind: "ok"; value: RoleDetail }
  | { kind: "validation_failed"; field: EditRoleFieldError }
  | { kind: "name_taken" }
  | { kind: "stale_version" }
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

function roleSummaryFromWire(row: {
  id: string;
  name: string | null;
  is_administrator: boolean;
  permissions: string[];
  user_count: number;
}): RoleSummary {
  return {
    id: row.id,
    name: row.name,
    isAdministrator: row.is_administrator,
    permissionKeys: row.permissions,
    userCount: row.user_count,
  };
}

/** Lists every role with its permissions and user count, Administrator only (`GET /roles`). */
export async function fetchRoles(): Promise<FetchRolesOutcome> {
  let response: Response;
  try {
    response = await fetch("/roles");
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
    | Array<Parameters<typeof roleSummaryFromWire>[0]>
    | undefined;
  if (!Array.isArray(body)) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: body.map(roleSummaryFromWire) };
}

function roleFieldFromWire(field: unknown): CreateRoleFieldError | undefined {
  return field === "name" || field === "permissions" ? field : undefined;
}

async function roleActionErrorOutcome(
  response: Response,
): Promise<
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "forbidden" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" }
> {
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
 * Creates the role with its hand-picked permissions, gated by the shared passkey-authorization
 * window instead of its own reauthentication step-up (`POST /roles`).
 */
export async function createRole(input: CreateRoleInput): Promise<CreateRoleOutcome> {
  let response: Response;
  try {
    response = await postJson("/roles", {
      name: input.name,
      permissions: input.permissionKeys,
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | Parameters<typeof roleSummaryFromWire>[0]
      | undefined;
    if (!body) {
      return { kind: "failed" };
    }
    return { kind: "ok", value: roleSummaryFromWire(body) };
  }
  if (response.status === 400) {
    const body = (await response.json().catch(() => undefined)) as
      | { code?: string; details?: Array<{ field?: string }> }
      | undefined;
    if (body?.code === "validation_failed") {
      const field = roleFieldFromWire(body.details?.[0]?.field);
      if (field) {
        return { kind: "validation_failed", field };
      }
    }
    return { kind: "failed" };
  }
  if (response.status === 409) {
    return { kind: "name_taken" };
  }
  return roleActionErrorOutcome(response);
}

function roleDetailFromWire(row: {
  id: string;
  name: string | null;
  is_administrator: boolean;
  permissions: string[];
  user_count: number;
  version: number;
  assigned_users: AssignedUser[];
}): RoleDetail {
  return { ...roleSummaryFromWire(row), version: row.version, assignedUsers: row.assigned_users };
}

/** Reads one role's current name, permissions, user count and version, Administrator only (`GET /roles/:id`). */
export async function fetchRole(id: string): Promise<FetchRoleOutcome> {
  let response: Response;
  try {
    response = await fetch(`/roles/${id}`);
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
    | Parameters<typeof roleDetailFromWire>[0]
    | undefined;
  if (!body) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: roleDetailFromWire(body) };
}

function editRoleFieldFromWire(field: unknown): EditRoleFieldError | undefined {
  return field === "name" || field === "permissions" || field === "version" ? field : undefined;
}

/**
 * Applies the edit, rejecting a save over a newer version, gated by the shared
 * passkey-authorization window instead of its own reauthentication step-up
 * (`POST /roles/:id/edit`).
 */
export async function editRole(id: string, input: EditRoleInput): Promise<EditRoleOutcome> {
  let response: Response;
  try {
    response = await postJson(`/roles/${id}/edit`, {
      name: input.name,
      permissions: input.permissionKeys,
      version: input.version,
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | Parameters<typeof roleDetailFromWire>[0]
      | undefined;
    if (!body) {
      return { kind: "failed" };
    }
    return { kind: "ok", value: roleDetailFromWire(body) };
  }
  if (response.status === 400) {
    const body = (await response.json().catch(() => undefined)) as
      | { code?: string; details?: Array<{ field?: string }> }
      | undefined;
    if (body?.code === "validation_failed") {
      const field = editRoleFieldFromWire(body.details?.[0]?.field);
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
    return body?.code === "stale_version" ? { kind: "stale_version" } : { kind: "name_taken" };
  }
  return roleActionErrorOutcome(response);
}
