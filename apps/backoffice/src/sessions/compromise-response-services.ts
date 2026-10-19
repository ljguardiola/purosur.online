import { startAuthentication } from "@simplewebauthn/browser";
import { fetchUsers } from "../platform/branch-users-api";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import {
  endSessionsAndRemovePasskeys,
  fetchCompromiseResponse,
  forcePinResets,
  markItemDone,
  revokeEveryInstallation,
  startCompromiseResponse,
} from "./compromise-response-api";
import type { EndSessionsStepModalServices } from "./end-sessions-step-modal";
import type { ForcePinResetsStepModalServices } from "./force-pin-resets-step-modal";
import type { RevokeInstallationsStepModalServices } from "./revoke-installations-step-modal";

export type CompromiseResponseScreenServices = {
  fetchCompromiseResponse: typeof fetchCompromiseResponse;
  startCompromiseResponse: typeof startCompromiseResponse;
  markItemDone: typeof markItemDone;
} & RevokeInstallationsStepModalServices &
  ForcePinResetsStepModalServices &
  EndSessionsStepModalServices;

export const defaultCompromiseResponseScreenServices: CompromiseResponseScreenServices = {
  fetchCompromiseResponse,
  startCompromiseResponse,
  markItemDone,
  revokeEveryInstallation,
  forcePinResets,
  endSessionsAndRemovePasskeys,
  fetchUsers,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
