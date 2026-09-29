import { startAuthentication } from "@simplewebauthn/browser";
import type { DeactivateUserModalServices } from "./deactivate-user-modal";
import type { EditUserModalServices } from "./edit-user-modal";
import type { ReactivateUserModalServices } from "./reactivate-user-modal";
import type { RemoveUserPasskeyModalServices } from "./remove-user-passkey-modal";
import { fetchRoles } from "./roles-api";
import { authorizeSession, fetchSessionAuthorizationOptions } from "./session-api";
import {
  deactivateUser,
  editUser,
  fetchUser,
  fetchUserPasskeys,
  reactivateUser,
  removeUserPasskey,
} from "./users-api";

export type UserDetailScreenServices = {
  fetchUser: typeof fetchUser;
  fetchRoles: typeof fetchRoles;
  fetchUserPasskeys: typeof fetchUserPasskeys;
} & EditUserModalServices &
  RemoveUserPasskeyModalServices &
  DeactivateUserModalServices &
  ReactivateUserModalServices;

export const defaultUserDetailScreenServices: UserDetailScreenServices = {
  fetchUser,
  editUser,
  fetchRoles,
  fetchUserPasskeys,
  removeUserPasskey,
  deactivateUser,
  reactivateUser,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
