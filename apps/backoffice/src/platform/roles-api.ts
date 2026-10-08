import { type RoleSummaryWire, roleListSchema } from "@purosur/contracts";
import type { CloudReadOutcome } from "./cloud-read-outcome";
import { rateLimitOutcome } from "./rate-limit-outcome";

export type RoleSummary = ReturnType<typeof roleSummaryFromWire>;

export type FetchRolesOutcome = CloudReadOutcome<RoleSummary[]>;

export function roleSummaryFromWire(row: RoleSummaryWire) {
  return {
    id: row.id,
    name: row.name,
    isAdministrator: row.is_administrator,
    permissionKeys: row.permissions,
    userCount: row.user_count,
    mayEdit: row.may_edit,
  };
}

export async function fetchRoles(): Promise<FetchRolesOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/roles");
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
  const parsed = roleListSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: parsed.data.map(roleSummaryFromWire) };
}
