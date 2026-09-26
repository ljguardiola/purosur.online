import { navigate } from "./router";

export const MY_ACCOUNT_PATH = "/settings/users/me";

/**
 * Where the signed-in user lands when a screen or action is no longer theirs to use (a settings
 * URL they can't open, or a `forbidden` answer mid-use): Mi cuenta, replacing the refused screen in
 * the history so going back doesn't return to it.
 */
export function sendToMyAccount(): void {
  navigate(MY_ACCOUNT_PATH, { replace: true });
}
/** The Users list, open to whoever `canSeeUsersArea` admits: the sidebar's "Usuarios" item now opens this, not `MY_ACCOUNT_PATH`. */
export const USERS_LIST_PATH = "/settings/users";
/** The Roles list, an Administrator-only screen: the sidebar's "Roles" item, and every role editor
 * action (new, edit, duplicate), open this — the editor itself is a modal over it, never its own
 * page or URL. */
export const ROLES_LIST_PATH = "/settings/roles";
/** The Sucursal screen, gated by `configure_branch`: the sidebar's "Sucursal" item opens this. */
export const BRANCH_SETTINGS_PATH = "/settings/branch";
/** The Cajas registradoras list, gated by `enroll_register_devices`: the sidebar's "Cajas
 * registradoras" item opens this. */
export const REGISTERS_LIST_PATH = "/settings/registers";

/** The Users list row action's own target: one user's detail screen. */
export function userDetailPath(id: string): string {
  return `${USERS_LIST_PATH}/${id}`;
}

/**
 * Extracts the id from a `/settings/users/:id` path, distinguishing it from the fixed
 * `MY_ACCOUNT_PATH` (`/settings/users/me`) and the list itself, which both share the same prefix.
 */
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
