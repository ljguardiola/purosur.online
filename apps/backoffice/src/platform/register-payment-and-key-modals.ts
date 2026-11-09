import type { ComponentType } from "react";
import type { RegisterModalContextSource } from "./register-modal-context";
import type { RegisterPaymentsReload, RegisterPaymentsTarget } from "./register-payments-target";

export type RegisterKeyTarget = RegisterModalContextSource & { id: string };

export type RegisterPaymentAndKeyModalRequest =
  | { kind: "assignTerminal"; register: RegisterPaymentsTarget }
  | { kind: "assignQr"; register: RegisterPaymentsTarget }
  | { kind: "loadKey"; register: RegisterKeyTarget }
  | { kind: "consultKey"; register: RegisterKeyTarget };

export type RegisterPaymentAndKeyModalsProps = {
  request: RegisterPaymentAndKeyModalRequest | null;
  reload: (id: string) => Promise<RegisterPaymentsReload>;
  onClose: () => void;
  onAssigned: () => void;
  onKeyLoaded: () => void;
  onOutdated: () => void;
  onSessionEnded: () => void;
};

export type RegisterPaymentAndKeyModals = ComponentType<RegisterPaymentAndKeyModalsProps>;
