import type { ComponentType } from "react";
import type { RegisterModalContextSource } from "./register-modal-context";

export type RegisterKeyTarget = RegisterModalContextSource & { id: string };

export type RegisterKeyModalRequest =
  | { kind: "loadKey"; register: RegisterKeyTarget }
  | { kind: "consultKey"; register: RegisterKeyTarget };

export type RegisterKeyModalsProps = {
  request: RegisterKeyModalRequest | null;
  onClose: () => void;
  onKeyLoaded: () => void;
  onOutdated: () => void;
  onSessionEnded: () => void;
};

export type RegisterKeyModals = ComponentType<RegisterKeyModalsProps>;
