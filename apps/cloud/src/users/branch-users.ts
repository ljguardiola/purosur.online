import { type BranchUserWire, branchUserSchema } from "@purosur/contracts";
import {
  grantsCapability,
  mayDeactivateUser,
  mayEditUser,
  mayEmitPinCode,
  mayReactivateUser,
  mayRemoveUserPasskey,
} from "@purosur/domain";
import type { BranchUser } from "@purosur/domain/users/use-cases";
import type { OpenSession } from "../access/open-session.js";

export function canReactivateUsers(
  session: Pick<OpenSession, "isAdministrator" | "permissionKeys">,
): boolean {
  return grantsCapability(session, "reactivate_users");
}

export function toBranchUserWire(
  row: BranchUser,
  session: Pick<OpenSession, "userId" | "isAdministrator" | "permissionKeys">,
  options: { includeActive?: boolean } = {},
): BranchUserWire {
  const actor = {
    id: session.userId,
    isAdministrator: session.isAdministrator,
    permissionKeys: session.permissionKeys,
  };
  const target = { id: row.id, isAdministrator: row.roleIsAdministrator, active: row.active };
  return branchUserSchema.parse({
    id: row.id,
    first_name: row.firstName,
    email: row.email,
    version: row.version,
    ...(options.includeActive ? { active: row.active } : {}),
    role: { id: row.roleId, is_administrator: row.roleIsAdministrator, name: row.roleName },
    passkey_count: row.passkeyCount,
    is_last_active_administrator: row.isLastActiveAdministrator,
    may_emit_pin_code: mayEmitPinCode(actor, target),
    may_edit: mayEditUser(actor, target),
    may_deactivate: mayDeactivateUser(actor, target),
    may_reactivate: mayReactivateUser(actor, target),
    may_remove_passkey: mayRemoveUserPasskey(actor, target),
  });
}
