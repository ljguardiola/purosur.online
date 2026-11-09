import { vi } from "vitest";
import {
  RegisterPaymentModals as RealRegisterPaymentModals,
  type RegisterPaymentModalsServices,
} from "../../payments/register-payment-modals";
import { RegisterPaymentsSection } from "../../payments/register-payments-section";
import type { RegisterKeyModals } from "../../platform/register-key-modals";
import type { RegisterPanelSections } from "../../platform/register-panel-sections";
import type { RegisterPaymentModals } from "../../platform/register-payment-modals";
import {
  RegisterKeyModals as RealRegisterKeyModals,
  type RegisterKeyModalsServices,
} from "../../register/register-key-modals";
import {
  RegisterSessionsSection,
  type RegisterSessionsSectionServices,
} from "../../register/register-sessions-section";
import { SnapshotBackupsSection } from "../../register/snapshot-backups-section";
import type { SnapshotBackupsSectionServices } from "../../register/snapshot-backups-services";

export type RegisterPartsServices = SnapshotBackupsSectionServices &
  RegisterSessionsSectionServices &
  RegisterPaymentModalsServices &
  RegisterKeyModalsServices;

export function createRegisterPartsServices(
  overrides: Partial<RegisterPartsServices> = {},
): RegisterPartsServices {
  return {
    assignPointTerminal: vi.fn(),
    assignQrPointOfSale: vi.fn(),
    loadBitlockerRecoveryKey: vi.fn(),
    consultBitlockerRecoveryKey: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    fetchSnapshotBackups: vi.fn(),
    changeSnapshotLifecycleRules: vi.fn(),
    rotateSnapshotKey: vi.fn(),
    fetchCashSessionCloses: vi.fn(),
    ...overrides,
  };
}

export function registerPartsOf(services: RegisterPartsServices): {
  panelSections: RegisterPanelSections;
  paymentModals: RegisterPaymentModals;
  keyModals: RegisterKeyModals;
} {
  return {
    panelSections: {
      payments: RegisterPaymentsSection,
      backups: (props) => <SnapshotBackupsSection {...props} services={services} />,
      sessions: (props) => <RegisterSessionsSection {...props} services={services} />,
    },
    paymentModals: (props) => <RealRegisterPaymentModals {...props} services={services} />,
    keyModals: (props) => <RealRegisterKeyModals {...props} services={services} />,
  };
}
