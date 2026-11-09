import type { ComponentType, ReactNode } from "react";
import type { RegisterPaymentsTarget } from "./register-payments-target";

export type RegisterPaymentsSectionProps = {
  register: RegisterPaymentsTarget;
  mayAssignPointTerminal: boolean;
  mayAssignQrPointOfSale: boolean;
  onAssignPointTerminal: () => void;
  onAssignQrPointOfSale: () => void;
  pointOfSaleSlot?: ReactNode | undefined;
};

export type RegisterBackupsSectionProps = {
  register: { id: string; name: string };
  onSessionEnded: () => void;
};

type RegisterSessionsPeriod = { from: string; to: string };

export type RegisterSessionsSectionProps = {
  registerId: string;
  period: RegisterSessionsPeriod;
  onPeriodChange: (period: RegisterSessionsPeriod) => void;
  onSessionEnded: () => void;
};

export type RegisterPanelSections = {
  payments: ComponentType<RegisterPaymentsSectionProps>;
  backups: ComponentType<RegisterBackupsSectionProps>;
  sessions: ComponentType<RegisterSessionsSectionProps>;
};
