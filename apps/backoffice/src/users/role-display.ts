import type { Option, Options } from "@purosur/ui";
import type { BranchUserRole } from "../platform/branch-users-api";
import { roleDisplayName } from "../platform/role-display-name";

export function roleOptions(roles: BranchUserRole[]): Options<Option<string>> {
  const [first, ...rest] = roles.map((role) => ({ value: role.id, label: roleDisplayName(role) }));
  if (!first) {
    throw new Error("no role to offer: the signed-in Administrator is always in the list");
  }
  return [first, ...rest];
}
