import { startAuthentication } from "@simplewebauthn/browser";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import {
  fetchOwnAlertEmailOptIn,
  recordOwnAlertEmailOptIn,
  withdrawOwnAlertEmailOptIn,
} from "./alert-email-opt-in-api";

export type OwnAlertEmailOptInSectionServices = {
  fetchOwnAlertEmailOptIn: typeof fetchOwnAlertEmailOptIn;
  recordOwnAlertEmailOptIn: typeof recordOwnAlertEmailOptIn;
  withdrawOwnAlertEmailOptIn: typeof withdrawOwnAlertEmailOptIn;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

export const defaultOwnAlertEmailOptInSectionServices: OwnAlertEmailOptInSectionServices = {
  fetchOwnAlertEmailOptIn,
  recordOwnAlertEmailOptIn,
  withdrawOwnAlertEmailOptIn,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
