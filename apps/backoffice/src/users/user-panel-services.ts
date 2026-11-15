import { startAuthentication } from "@simplewebauthn/browser";
import { fetchRoles } from "../platform/roles-api";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import { withdrawUserAlertEmailOptIn } from "./alert-email-opt-in-api";
import type { DeactivateUserModalServices } from "./deactivate-user-modal";
import type { EditUserModalServices } from "./edit-user-modal";
import type { ReactivateUserModalServices } from "./reactivate-user-modal";
import { deactivateUser, editUser, fetchUser, reactivateUser } from "./users-api";
import type { WithdrawUserAlertEmailOptInModalServices } from "./withdraw-user-alert-email-opt-in-modal";

export type UserPanelServices = {
  fetchUser: typeof fetchUser;
  fetchRoles: typeof fetchRoles;
} & EditUserModalServices &
  DeactivateUserModalServices &
  ReactivateUserModalServices &
  WithdrawUserAlertEmailOptInModalServices;

export const defaultUserPanelServices: UserPanelServices = {
  fetchUser,
  editUser,
  fetchRoles,
  deactivateUser,
  reactivateUser,
  withdrawUserAlertEmailOptIn,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
