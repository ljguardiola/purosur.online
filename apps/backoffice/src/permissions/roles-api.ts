import {
  type RoleCreationBody,
  type RoleDetailWire,
  type RoleEditBody,
  roleDetailSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { roleSummaryFromWire } from "../platform/roles-api";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type CreateRoleOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "name_taken" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type RoleDetail = ReturnType<typeof roleDetailFromWire>;

export type AssignedUser = RoleDetail["assignedUsers"][number];

export type FetchRoleOutcome = CloudReadOutcome<RoleDetail> | { kind: "not_found" };

export type EditRoleOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "name_taken" }
  | { kind: "stale_version" }
  | { kind: "not_found" }
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
    return rateLimitOutcome(response);
  }
  return { kind: "failed" };
}

export async function createRole(input: RoleCreationBody): Promise<CreateRoleOutcome> {
  let response: Response;
  try {
    response = await postJson("/api/roles", input);
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
  return roleActionErrorOutcome(response);
}

function roleDetailFromWire(row: RoleDetailWire) {
  return { ...roleSummaryFromWire(row), version: row.version, assignedUsers: row.assigned_users };
}

export async function fetchRole(id: string): Promise<FetchRoleOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/roles/${id}`);
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
  const parsed = roleDetailSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: roleDetailFromWire(parsed.data) };
}

export async function editRole(id: string, input: RoleEditBody): Promise<EditRoleOutcome> {
  let response: Response;
  try {
    response = await sendJson("PUT", `/api/roles/${id}`, input);
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
    return body?.code === "stale_version" ? { kind: "stale_version" } : { kind: "name_taken" };
  }
  return roleActionErrorOutcome(response);
}
