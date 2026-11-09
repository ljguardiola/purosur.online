import { startAuthentication } from "@simplewebauthn/browser";
import type { RegisterKeyModalsProps } from "../platform/register-key-modals";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import {
  consultBitlockerRecoveryKey,
  loadBitlockerRecoveryKey,
} from "./bitlocker-recovery-key-api";
import {
  ConsultBitlockerRecoveryKeyModal,
  type ConsultBitlockerRecoveryKeyModalServices,
} from "./consult-bitlocker-recovery-key-modal";
import {
  LoadBitlockerRecoveryKeyModal,
  type LoadBitlockerRecoveryKeyModalServices,
} from "./load-bitlocker-recovery-key-modal";

export type RegisterKeyModalsServices = LoadBitlockerRecoveryKeyModalServices &
  ConsultBitlockerRecoveryKeyModalServices;

export const defaultRegisterKeyModalsServices: RegisterKeyModalsServices = {
  loadBitlockerRecoveryKey,
  consultBitlockerRecoveryKey,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};

export function RegisterKeyModals({
  request,
  onClose,
  onKeyLoaded,
  onOutdated,
  onSessionEnded,
  services = defaultRegisterKeyModalsServices,
}: RegisterKeyModalsProps & { services?: RegisterKeyModalsServices | undefined }) {
  return (
    <>
      <LoadBitlockerRecoveryKeyModal
        target={request?.kind === "loadKey" ? request.register : null}
        onClose={onClose}
        onLoaded={onKeyLoaded}
        onOutdated={onOutdated}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <ConsultBitlockerRecoveryKeyModal
        target={request?.kind === "consultKey" ? request.register : null}
        onClose={onClose}
        onOutdated={onOutdated}
        onSessionEnded={onSessionEnded}
        services={services}
      />
    </>
  );
}
