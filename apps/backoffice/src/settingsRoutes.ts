import { navigate } from "./router";

export const MY_ACCOUNT_PATH = "/settings/users/me";

/** Where a no-longer-authorized user lands (Mi cuenta), replacing history so back doesn't return to the refused screen. */
export function sendToMyAccount(): void {
  navigate(MY_ACCOUNT_PATH, { replace: true });
}
export const USERS_LIST_PATH = "/settings/users";
/** The Roles list; editing happens in a modal over it, never its own route. */
export const ROLES_LIST_PATH = "/settings/roles";
export const BRANCH_SETTINGS_PATH = "/settings/branch";
export const REGISTERS_LIST_PATH = "/settings/registers";

export function userDetailPath(id: string): string {
  return `${USERS_LIST_PATH}/${id}`;
}

/** The id from a `/settings/users/:id` path, distinguishing it from `MY_ACCOUNT_PATH` and the list path (both share this prefix). */
export function matchUserDetailPath(path: string): string | undefined {
  if (path === MY_ACCOUNT_PATH || path === USERS_LIST_PATH) {
    return undefined;
  }
  const prefix = `${USERS_LIST_PATH}/`;
  if (!path.startsWith(prefix)) {
    return undefined;
  }
  const rest = path.slice(prefix.length);
  return rest && !rest.includes("/") ? rest : undefined;
}
