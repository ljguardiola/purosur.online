import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { vi } from "vitest";
import type { BackofficeAccess } from "../../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS } from "../../shell/test-support/backoffice-access";
import { render } from "../../shell/test-support/render-with-router";
import { registerKey } from "../register-queries";
import type { RegisterSummary } from "../registers-api";
import { RegistersListScreen } from "../registers-list-screen";
import type { RegistersListScreenServices } from "../registers-list-services";

export function createServices(
  overrides: Partial<RegistersListScreenServices> = {},
): RegistersListScreenServices {
  return {
    fetchRegisters: vi.fn(),
    fetchRegisterCoverage: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    createRegister: vi.fn(),
    assignPointTerminal: vi.fn(),
    emitEnrollmentCode: vi.fn(),
    revokeRegister: vi.fn(),
    revokeEveryInstallation: vi.fn(),
    loadBitlockerRecoveryKey: vi.fn(),
    consultBitlockerRecoveryKey: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

export const register1: RegisterSummary = {
  id: "register-1",
  name: "Caja 1",
  pendingCode: null,
  pointOfSaleNumber: null,
  pointTerminalId: null,
  pointTerminalVersion: 0,
  installation: null,
};
export const register2: RegisterSummary = {
  id: "register-2",
  name: "Caja 2",
  pendingCode: { secondsSinceIssued: 240, secondsUntilExpiry: 660 },
  pointOfSaleNumber: 3,
  pointTerminalId: "TERM-0042",
  pointTerminalVersion: 2,
  installation: null,
};
export const enrolledRegister: RegisterSummary = {
  id: "register-3",
  name: "Caja 3",
  pendingCode: null,
  pointOfSaleNumber: null,
  pointTerminalId: null,
  pointTerminalVersion: 0,
  installation: {
    state: "enrolled",
    hostname: "CAJA-MOSTRADOR",
    windowsVersion: "Windows 11 Pro 10.0.26100",
    enrolledAt: "2026-08-02T01:30:00.000Z",
    bitlockerKeyLoaded: false,
  },
};
export const registerWithBitlockerKey: RegisterSummary = {
  ...enrolledRegister,
  id: "register-5",
  name: "Caja 5",
  installation: {
    state: "enrolled",
    hostname: "NOTEBOOK-MOSTRADOR",
    windowsVersion: "Windows 11",
    enrolledAt: "2026-08-02T01:30:00.000Z",
    bitlockerKeyLoaded: true,
  },
};
export const revokedRegister: RegisterSummary = {
  id: "register-4",
  name: "Caja 4",
  pendingCode: null,
  pointOfSaleNumber: null,
  pointTerminalId: null,
  pointTerminalVersion: 0,
  installation: {
    state: "revoked",
    hostname: "CAJA-DEPOSITO",
    windowsVersion: "Windows 10 Pro 10.0.19045",
    enrolledAt: "2026-08-01T15:00:00.000Z",
    revokedAt: "2026-08-04T02:00:00.000Z",
  },
};

const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

export function grantAuthorization(services: RegistersListScreenServices) {
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
}

function FetchesInFlight() {
  return <output aria-label="Lecturas en curso">{useIsFetching()}</output>;
}

function RefreshRegisters() {
  const client = useQueryClient();
  return (
    <button type="button" onClick={() => void client.invalidateQueries({ queryKey: registerKey })}>
      Refrescar
    </button>
  );
}

export function renderScreen(
  services: RegistersListScreenServices,
  onSessionEnded: () => void = () => {},
  access: BackofficeAccess = ADMINISTRATOR_ACCESS,
) {
  return render(
    <main>
      <RegistersListScreen access={access} services={services} onSessionEnded={onSessionEnded} />
      <FetchesInFlight />
      <RefreshRegisters />
    </main>,
  );
}

export async function renderRegisters(registers: RegisterSummary[], access?: BackofficeAccess) {
  const services = createServices();
  vi.mocked(services.fetchRegisters).mockResolvedValue({ kind: "ok", value: registers });
  const screen = await renderScreen(services, undefined, access);
  return { services, screen };
}
