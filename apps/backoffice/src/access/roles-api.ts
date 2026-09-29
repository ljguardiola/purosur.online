import {
  type RoleCreationBody,
  type RoleDetailWire,
  type RoleEditBody,
  type RoleSummaryWire,
  roleDetailSchema,
  roleListSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { retryAfterSeconds } from "../platform/retry-after-seconds";

export type RoleSummary = ReturnType<typeof roleSummaryFromWire>;

export type FetchRolesOutcome = CloudReadOutcome<RoleSummary[]>;

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

export type RoleDetail = ReturnType<typeof roleDetailFromWire>;

export type AssignedUser = RoleDetail["assignedUsers"][number];

export type FetchRoleOutcome = CloudReadOutcome<RoleDetail> | { kind: "not_found" };

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

function postJson(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function roleSummaryFromWire(row: RoleSummaryWire) {
  return {
    id: row.id,
    name: row.name,
    isAdministrator: row.is_administrator,
    permissionKeys: row.permissions,
    userCount: row.user_count,
  };
}

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
  const parsed = roleListSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: parsed.data.map(roleSummaryFromWire) };
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

export async function createRole(input: CreateRoleInput): Promise<CreateRoleOutcome> {
  const requestBody: RoleCreationBody = {
    name: input.name,
    permissions: input.permissionKeys,
  };
  let response: Response;
  try {
    response = await postJson("/roles", requestBody);
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

function roleDetailFromWire(row: RoleDetailWire) {
  return { ...roleSummaryFromWire(row), version: row.version, assignedUsers: row.assigned_users };
}

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
  const parsed = roleDetailSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: roleDetailFromWire(parsed.data) };
}

function editRoleFieldFromWire(field: unknown): EditRoleFieldError | undefined {
  return field === "name" || field === "permissions" || field === "version" ? field : undefined;
}

export async function editRole(id: string, input: EditRoleInput): Promise<EditRoleOutcome> {
  const requestBody: RoleEditBody = {
    name: input.name,
    permissions: input.permissionKeys,
    version: input.version,
  };
  let response: Response;
  try {
    response = await postJson(`/roles/${id}/edit`, requestBody);
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
