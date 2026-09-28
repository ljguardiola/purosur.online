import { startAuthentication } from "@simplewebauthn/browser";
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
  editUser: typeof editUser;
  fetchRoles: typeof fetchRoles;
  fetchUserPasskeys: typeof fetchUserPasskeys;
  removeUserPasskey: typeof removeUserPasskey;
  deactivateUser: typeof deactivateUser;
  reactivateUser: typeof reactivateUser;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

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
