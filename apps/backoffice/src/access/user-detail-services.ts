import { startAuthentication } from "@simplewebauthn/browser";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type { DeactivateUserModalServices } from "./deactivate-user-modal";
import type { EditUserModalServices } from "./edit-user-modal";
import type { EmitUserPinCodeModalServices } from "./emit-user-pin-code-modal";
import type { ReactivateUserModalServices } from "./reactivate-user-modal";
import type { RemoveUserPasskeyModalServices } from "./remove-user-passkey-modal";
import { fetchRoles } from "./roles-api";
import {
  deactivateUser,
  editUser,
  emitUserPinCode,
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
  ReactivateUserModalServices &
  EmitUserPinCodeModalServices;

export const defaultUserDetailScreenServices: UserDetailScreenServices = {
  fetchUser,
  editUser,
  fetchRoles,
  fetchUserPasskeys,
  removeUserPasskey,
  deactivateUser,
  reactivateUser,
  emitUserPinCode,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
