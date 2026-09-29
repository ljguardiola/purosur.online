import { startAuthentication } from "@simplewebauthn/browser";
import { authorizeSession, fetchSessionAuthorizationOptions } from "../access/session-api";
import type { NewRegisterModalServices } from "./new-register-modal";
import {
  createRegister,
  emitEnrollmentCode,
  fetchRegisterCoverage,
  fetchRegisters,
} from "./registers-api";

export type RegistersListScreenServices = {
  fetchRegisters: typeof fetchRegisters;
  fetchRegisterCoverage: typeof fetchRegisterCoverage;
  emitEnrollmentCode: typeof emitEnrollmentCode;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
} & NewRegisterModalServices;

export const defaultRegistersListScreenServices: RegistersListScreenServices = {
  fetchRegisters,
  fetchRegisterCoverage,
  createRegister,
  emitEnrollmentCode,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
