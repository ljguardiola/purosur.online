import { vi } from "vitest";
import type { RegisterPanelSections } from "../../platform/register-panel-sections";
import type { RegisterPaymentAndKeyModals } from "../../platform/register-payment-and-key-modals";
import {
  RegisterPaymentAndKeyModals as RealRegisterPaymentAndKeyModals,
  type RegisterPaymentAndKeyModalsServices,
} from "../../register/register-payment-and-key-modals";
import { RegisterPaymentsSection } from "../../register/register-payments-section";
import {
  RegisterSessionsSection,
  type RegisterSessionsSectionServices,
} from "../../register/register-sessions-section";
import { SnapshotBackupsSection } from "../../register/snapshot-backups-section";
import type { SnapshotBackupsSectionServices } from "../../register/snapshot-backups-services";

export type RegisterPartsServices = SnapshotBackupsSectionServices &
  RegisterSessionsSectionServices &
  RegisterPaymentAndKeyModalsServices;

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
  paymentAndKeyModals: RegisterPaymentAndKeyModals;
} {
  return {
    panelSections: {
      payments: RegisterPaymentsSection,
      backups: (props) => <SnapshotBackupsSection {...props} services={services} />,
      sessions: (props) => <RegisterSessionsSection {...props} services={services} />,
    },
    paymentAndKeyModals: (props) => (
      <RealRegisterPaymentAndKeyModals {...props} services={services} />
    ),
  };
}
