import { startAuthentication } from "@simplewebauthn/browser";
import type { ComponentType } from "react";
import { fetchRoles } from "../platform/roles-api";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type { DeactivateUserModalServices } from "./deactivate-user-modal";
import type { EditUserModalServices } from "./edit-user-modal";
import type { ReactivateUserModalServices } from "./reactivate-user-modal";
import type { UserCredentialSectionsProps } from "./user-detail-screen";
import { deactivateUser, editUser, fetchUser, reactivateUser } from "./users-api";

export type UserDetailScreenServices = {
  fetchUser: typeof fetchUser;
  fetchRoles: typeof fetchRoles;
} & EditUserModalServices &
  DeactivateUserModalServices &
  ReactivateUserModalServices;

export type UserDetailPageServices = UserDetailScreenServices & {
  credentialSections: ComponentType<UserCredentialSectionsProps>;
};

export const defaultUserDetailScreenServices: UserDetailScreenServices = {
  fetchUser,
  editUser,
  fetchRoles,
  deactivateUser,
  reactivateUser,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
