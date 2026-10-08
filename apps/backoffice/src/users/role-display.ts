import type { Option, Options } from "@purosur/ui";
import { roleDisplayName } from "../platform/role-display-name";
import type { BranchUserRole } from "./users-api";

export function roleOptions(roles: BranchUserRole[]): Options<Option<string>> {
  const [first, ...rest] = roles.map((role) => ({ value: role.id, label: roleDisplayName(role) }));
  if (!first) {
    throw new Error("no role to offer: the signed-in Administrator is always in the list");
  }
  return [first, ...rest];
}
