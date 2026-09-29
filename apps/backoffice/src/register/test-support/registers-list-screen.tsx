import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { vi } from "vitest";
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
    emitEnrollmentCode: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

export const register1: RegisterSummary = { id: "register-1", name: "Caja 1", pendingCode: null };
export const register2: RegisterSummary = {
  id: "register-2",
  name: "Caja 2",
  pendingCode: { issuedAt: "2026-09-25T11:56:00.000Z", expiresAt: "2026-09-25T12:11:00.000Z" },
};

export const NOW = () => new Date("2026-09-25T12:00:00.000Z");

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
) {
  return render(
    <main>
      <RegistersListScreen services={services} onSessionEnded={onSessionEnded} now={NOW} />
      <FetchesInFlight />
      <RefreshRegisters />
    </main>,
  );
}
