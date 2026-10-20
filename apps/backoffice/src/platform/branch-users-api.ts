import { type BranchUserWire, branchUserListSchema } from "@purosur/contracts";
import type { CloudReadOutcome } from "./cloud-read-outcome";
import { rateLimitOutcome } from "./rate-limit-outcome";

export type BranchUser = ReturnType<typeof branchUserFromWire>;

export type BranchUserRole = BranchUser["role"];

export type FetchUsersOutcome = CloudReadOutcome<BranchUser[]>;

export function branchUserFromWire(row: BranchUserWire) {
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
  return { kind: "ok", value: parsed.data.map(branchUserFromWire) };
}
