import type { SelectOption } from "@purosur/ui";
import type { RoleSummary } from "./roles-api";
import type { BranchUserRole } from "./users-api";

export const ADMINISTRATOR_ROLE_NAME = "Administrador";

// The Administrator role's own `name` is stored empty; it is shown by its fixed name instead.
export function roleDisplayName(role: Pick<RoleSummary, "isAdministrator" | "name">): string {
  return role.isAdministrator ? ADMINISTRATOR_ROLE_NAME : (role.name ?? "");
}

export function roleOptions(
  roles: BranchUserRole[],
): [SelectOption<string>, ...SelectOption<string>[]] {
  const [first, ...rest] = roles.map((role) => ({ value: role.id, label: roleDisplayName(role) }));
  if (!first) {
    throw new Error("no role to offer: the signed-in Administrator is always in the list");
  }
  return [first, ...rest];
}
