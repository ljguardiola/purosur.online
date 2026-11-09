import { startAuthentication } from "@simplewebauthn/browser";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type { NewRegisterModalServices } from "./new-register-modal";
import {
  createRegister,
  emitEnrollmentCode,
  fetchFiscalRegisterNames,
  fetchRegisterCoverage,
  fetchRegisters,
  fetchSnapshotBackupRegisters,
  revokeEveryInstallation,
  revokeRegister,
} from "./registers-api";
import type { RevokeEveryInstallationModalServices } from "./revoke-every-installation-modal";
import type { RevokeRegisterModalServices } from "./revoke-register-modal";

export type RegistersListScreenServices = {
  fetchRegisters: typeof fetchRegisters;
  fetchSnapshotBackupRegisters: typeof fetchSnapshotBackupRegisters;
  fetchFiscalRegisterNames: typeof fetchFiscalRegisterNames;
  fetchRegisterCoverage: typeof fetchRegisterCoverage;
  emitEnrollmentCode: typeof emitEnrollmentCode;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
} & NewRegisterModalServices &
  RevokeRegisterModalServices &
  RevokeEveryInstallationModalServices;

export const defaultRegistersListScreenServices: RegistersListScreenServices = {
  fetchRegisters,
  fetchSnapshotBackupRegisters,
  fetchFiscalRegisterNames,
  fetchRegisterCoverage,
  createRegister,
  emitEnrollmentCode,
  revokeRegister,
  revokeEveryInstallation,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
