import type { SelectOption } from "@purosur/ui";
import { messages } from "./messages";
import type { BranchUserRole } from "./usersApi";

const usersMessages = messages.settings.users;

/** Shared between the users list and a user's own detail screen: every role picker shows the Administrator's fixed name instead of its (empty) stored one. */
export function roleDisplayName(role: BranchUserRole): string {
  return role.isAdministrator ? usersMessages.administratorRoleName : (role.name ?? "");
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
