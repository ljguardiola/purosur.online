export const MY_ACCOUNT_PATH = "/settings/users/me";
/** The Users list, an Administrator-only screen: the sidebar's "Usuarios" item now opens this, not `MY_ACCOUNT_PATH`. */
export const USERS_LIST_PATH = "/settings/users";

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
