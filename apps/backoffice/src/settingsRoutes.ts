export const MY_ACCOUNT_PATH = "/settings/users/me";
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

/** The Roles list row action's own target: one role's edit screen. */
export function roleEditPath(id: string): string {
  return `${ROLES_LIST_PATH}/${id}${ROLE_EDIT_SUFFIX}`;
}

/**
 * Extracts the id from a `/settings/roles/:id/edit` path, distinguishing it from the list itself
 * and from `NEW_ROLE_PATH` (`/settings/roles/new`), which share the same prefix.
 */
export function matchRoleEditPath(path: string): string | undefined {
  const prefix = `${ROLES_LIST_PATH}/`;
  if (!path.startsWith(prefix) || !path.endsWith(ROLE_EDIT_SUFFIX)) {
    return undefined;
  }
  const rest = path.slice(prefix.length, -ROLE_EDIT_SUFFIX.length);
  return rest && !rest.includes("/") ? rest : undefined;
}
