import { startAuthentication } from "@simplewebauthn/browser";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import type { AssignPointTerminalModalServices } from "./assign-point-terminal-modal";
import type { ConsultBitlockerRecoveryKeyModalServices } from "./consult-bitlocker-recovery-key-modal";
import type { LoadBitlockerRecoveryKeyModalServices } from "./load-bitlocker-recovery-key-modal";
import type { NewRegisterModalServices } from "./new-register-modal";
import {
  assignPointTerminal,
  consultBitlockerRecoveryKey,
  createRegister,
  emitEnrollmentCode,
  fetchRegisterCoverage,
  fetchRegisters,
  loadBitlockerRecoveryKey,
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
  RevokeEveryInstallationModalServices &
  LoadBitlockerRecoveryKeyModalServices &
  ConsultBitlockerRecoveryKeyModalServices;

export const defaultRegistersListScreenServices: RegistersListScreenServices = {
  fetchRegisters,
  fetchRegisterCoverage,
  createRegister,
  assignPointTerminal,
  emitEnrollmentCode,
  revokeRegister,
  revokeEveryInstallation,
  loadBitlockerRecoveryKey,
  consultBitlockerRecoveryKey,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};
