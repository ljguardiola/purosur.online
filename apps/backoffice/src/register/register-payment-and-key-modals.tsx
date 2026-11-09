import { startAuthentication } from "@simplewebauthn/browser";
import type { RegisterPaymentAndKeyModalsProps } from "../platform/register-payment-and-key-modals";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import {
  AssignPointTerminalModal,
  type AssignPointTerminalModalServices,
} from "./assign-point-terminal-modal";
import {
  AssignQrPointOfSaleModal,
  type AssignQrPointOfSaleModalServices,
} from "./assign-qr-point-of-sale-modal";
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
import { assignPointTerminal, assignQrPointOfSale } from "./register-payments-api";

export type RegisterPaymentAndKeyModalsServices = AssignPointTerminalModalServices &
  AssignQrPointOfSaleModalServices &
  LoadBitlockerRecoveryKeyModalServices &
  ConsultBitlockerRecoveryKeyModalServices;

export const defaultRegisterPaymentAndKeyModalsServices: RegisterPaymentAndKeyModalsServices = {
  assignPointTerminal,
  assignQrPointOfSale,
  loadBitlockerRecoveryKey,
  consultBitlockerRecoveryKey,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};

export function RegisterPaymentAndKeyModals({
  request,
  reload,
  onClose,
  onAssigned,
  onKeyLoaded,
  onOutdated,
  onSessionEnded,
  services = defaultRegisterPaymentAndKeyModalsServices,
}: RegisterPaymentAndKeyModalsProps & {
  services?: RegisterPaymentAndKeyModalsServices | undefined;
}) {
  return (
    <>
      <AssignPointTerminalModal
        target={request?.kind === "assignTerminal" ? request.register : null}
        onClose={onClose}
        onSaved={onAssigned}
        reload={reload}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <AssignQrPointOfSaleModal
        target={request?.kind === "assignQr" ? request.register : null}
        onClose={onClose}
        onSaved={onAssigned}
        reload={reload}
        onSessionEnded={onSessionEnded}
        services={services}
      />
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
