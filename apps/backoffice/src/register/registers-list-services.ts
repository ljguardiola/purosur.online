import { startAuthentication } from "@simplewebauthn/browser";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type { AssignPointTerminalModalServices } from "./assign-point-terminal-modal";
import type { NewRegisterModalServices } from "./new-register-modal";
import {
  assignPointTerminal,
  createRegister,
  emitEnrollmentCode,
  fetchRegisterCoverage,
  fetchRegisters,
  revokeEveryInstallation,
  revokeRegister,
} from "./registers-api";
import type { RevokeEveryInstallationModalServices } from "./revoke-every-installation-modal";
import type { RevokeRegisterModalServices } from "./revoke-register-modal";

export type RegistersListScreenServices = {
  fetchRegisters: typeof fetchRegisters;
  fetchRegisterCoverage: typeof fetchRegisterCoverage;
  emitEnrollmentCode: typeof emitEnrollmentCode;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
} & NewRegisterModalServices &
  AssignPointTerminalModalServices &
  RevokeRegisterModalServices &
  RevokeEveryInstallationModalServices;

export const defaultRegistersListScreenServices: RegistersListScreenServices = {
  fetchRegisters,
  fetchRegisterCoverage,
  createRegister,
  assignPointTerminal,
  emitEnrollmentCode,
  revokeRegister,
  revokeEveryInstallation,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
