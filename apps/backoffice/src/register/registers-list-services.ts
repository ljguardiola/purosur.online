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
  revokeRegister,
} from "./registers-api";
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
  RevokeRegisterModalServices;

export const defaultRegistersListScreenServices: RegistersListScreenServices = {
  fetchRegisters,
  fetchRegisterCoverage,
  createRegister,
  assignPointTerminal,
  emitEnrollmentCode,
  revokeRegister,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
