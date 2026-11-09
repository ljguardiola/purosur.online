import type { RegisterPaymentModalsProps } from "../platform/register-payment-modals";
import {
  AssignPointTerminalModal,
  type AssignPointTerminalModalServices,
} from "./assign-point-terminal-modal";
import {
  AssignQrPointOfSaleModal,
  type AssignQrPointOfSaleModalServices,
} from "./assign-qr-point-of-sale-modal";
import { assignPointTerminal, assignQrPointOfSale } from "./register-payments-api";

export type RegisterPaymentModalsServices = AssignPointTerminalModalServices &
  AssignQrPointOfSaleModalServices;

export const defaultRegisterPaymentModalsServices: RegisterPaymentModalsServices = {
  assignPointTerminal,
  assignQrPointOfSale,
};

export function RegisterPaymentModals({
  request,
  reload,
  onClose,
  onAssigned,
  onSessionEnded,
  services = defaultRegisterPaymentModalsServices,
}: RegisterPaymentModalsProps & { services?: RegisterPaymentModalsServices | undefined }) {
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
    </>
  );
}
