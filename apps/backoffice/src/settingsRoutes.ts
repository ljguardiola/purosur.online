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
/** The Users list, an Administrator-only screen: the sidebar's "Usuarios" item now opens this, not `MY_ACCOUNT_PATH`. */
export const USERS_LIST_PATH = "/settings/users";
/** The Roles list, an Administrator-only screen: the sidebar's "Roles" item opens this. */
export const ROLES_LIST_PATH = "/settings/roles";
/** The Roles list's "Nuevo rol" action's own target: a full page, not a modal. */
export const NEW_ROLE_PATH = "/settings/roles/new";

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

const ROLE_EDIT_SUFFIX = "/edit";
const ROLE_DUPLICATE_SUFFIX = "/duplicate";

/**
 * Extracts the id from a `/settings/roles/:id<suffix>` path, distinguishing it from the list itself,
 * from `NEW_ROLE_PATH` (`/settings/roles/new`) and from the role's paths under any other suffix,
 * which all share the same prefix.
 */
function matchRolePathWithSuffix(path: string, suffix: string): string | undefined {
  const prefix = `${ROLES_LIST_PATH}/`;
  if (!path.startsWith(prefix) || !path.endsWith(suffix)) {
    return undefined;
  }
  const rest = path.slice(prefix.length, -suffix.length);
  return rest && !rest.includes("/") ? rest : undefined;
}

/** The Roles list row action's own target: one role's edit screen. */
export function roleEditPath(id: string): string {
  return `${ROLES_LIST_PATH}/${id}${ROLE_EDIT_SUFFIX}`;
}

/** Extracts the id from a `/settings/roles/:id/edit` path. */
export function matchRoleEditPath(path: string): string | undefined {
  return matchRolePathWithSuffix(path, ROLE_EDIT_SUFFIX);
}

/** The Roles list row action's own target: a new role's screen, pre-filled from this one. */
export function roleDuplicatePath(id: string): string {
  return `${ROLES_LIST_PATH}/${id}${ROLE_DUPLICATE_SUFFIX}`;
}

/** Extracts the id from a `/settings/roles/:id/duplicate` path. */
export function matchRoleDuplicatePath(path: string): string | undefined {
  return matchRolePathWithSuffix(path, ROLE_DUPLICATE_SUFFIX);
}
