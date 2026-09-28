import { startAuthentication } from "@simplewebauthn/browser";
import { authorizeSession, fetchSessionAuthorizationOptions } from "../access/session-api";
import { createRegister, emitEnrollmentCode, fetchRegisters } from "./registers-api";

export type RegistersListScreenServices = {
  fetchRegisters: typeof fetchRegisters;
  createRegister: typeof createRegister;
  emitEnrollmentCode: typeof emitEnrollmentCode;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

export const defaultRegistersListScreenServices: RegistersListScreenServices = {
  fetchRegisters,
  createRegister,
  emitEnrollmentCode,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
