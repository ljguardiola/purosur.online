import { type BranchUserWire, branchUserSchema } from "@purosur/contracts";
import type { BranchUser } from "@purosur/domain/access/use-cases";
import type { OpenSession } from "./open-session.js";
import { isAccessGranted, permissionAccess } from "./route-access.js";

export function canReactivateUsers(
  session: Pick<OpenSession, "isAdministrator" | "permissionKeys">,
): boolean {
  return isAccessGranted(permissionAccess("reactivate_users"), session);
}

export function toBranchUserWire(
  row: BranchUser,
  options: { includeActive?: boolean } = {},
): BranchUserWire {
  return branchUserSchema.parse({
    id: row.id,
    first_name: row.firstName,
    email: row.email,
    version: row.version,
    ...(options.includeActive ? { active: row.active } : {}),
    role: { id: row.roleId, is_administrator: row.roleIsAdministrator, name: row.roleName },
    passkey_count: row.passkeyCount,
    is_last_active_administrator: row.isLastActiveAdministrator,
  });
}
