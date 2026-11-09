import { vi } from "vitest";
import type { RegisterKeyTarget } from "../../platform/register-payment-and-key-modals";
import type { ConsultBitlockerRecoveryKeyModalServices } from "../consult-bitlocker-recovery-key-modal";
import type { LoadBitlockerRecoveryKeyModalServices } from "../load-bitlocker-recovery-key-modal";

type RegisterKeyModalsServices = LoadBitlockerRecoveryKeyModalServices &
  ConsultBitlockerRecoveryKeyModalServices;

export function createServices(): RegisterKeyModalsServices {
  return {
    loadBitlockerRecoveryKey: vi.fn(),
    consultBitlockerRecoveryKey: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
  };
}

export const enrolledRegister: RegisterKeyTarget = {
  id: "register-3",
  name: "Caja 3",
  installation: { hostname: "CAJA-MOSTRADOR" },
};

export const registerWithBitlockerKey: RegisterKeyTarget = {
  id: "register-5",
  name: "Caja 5",
  installation: { hostname: "NOTEBOOK-MOSTRADOR" },
};

const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

export function grantAuthorization(services: RegisterKeyModalsServices) {
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
}
