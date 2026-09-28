import { startAuthentication } from "@simplewebauthn/browser";
import { fetchRoles } from "./roles-api";
import { authorizeSession, fetchSessionAuthorizationOptions } from "./session-api";
import { createUser, fetchUsers } from "./users-api";

export type UsersListScreenServices = {
  fetchUsers: typeof fetchUsers;
  fetchRoles: typeof fetchRoles;
  createUser: typeof createUser;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

export const defaultUsersListScreenServices: UsersListScreenServices = {
  fetchUsers,
  fetchRoles,
  createUser,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
