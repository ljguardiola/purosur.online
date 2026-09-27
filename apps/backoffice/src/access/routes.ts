import { navigate } from "../shell/router";

export const SIGN_IN_PATH = "/sign-in";
export const ACCOUNT_RECOVERY_PATH = "/account-recovery";
export const REGISTER_PASSKEY_PATH = "/account-recovery/passkey";

export const MY_ACCOUNT_PATH = "/settings/users/me";

export function sendToMyAccount(): void {
  navigate(MY_ACCOUNT_PATH, { replace: true });
}
export const USERS_LIST_PATH = "/settings/users";
export const ROLES_LIST_PATH = "/settings/roles";

export function userDetailPath(id: string): string {
  return `${USERS_LIST_PATH}/${id}`;
}

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
