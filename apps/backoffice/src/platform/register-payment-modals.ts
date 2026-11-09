import type { ComponentType } from "react";
import type { RegisterPaymentsReload, RegisterPaymentsTarget } from "./register-payments-target";

export type RegisterPaymentModalRequest =
  | { kind: "assignTerminal"; register: RegisterPaymentsTarget }
  | { kind: "assignQr"; register: RegisterPaymentsTarget };

export type RegisterPaymentModalsProps = {
  request: RegisterPaymentModalRequest | null;
  reload: (id: string) => Promise<RegisterPaymentsReload>;
  onClose: () => void;
  onAssigned: () => void;
  onSessionEnded: () => void;
};

export type RegisterPaymentModals = ComponentType<RegisterPaymentModalsProps>;
