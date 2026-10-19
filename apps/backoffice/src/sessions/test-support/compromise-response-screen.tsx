import { vi } from "vitest";
import { render } from "../../shell/test-support/render-with-router";
import { CompromiseResponseScreen } from "../compromise-response-screen";
import type { CompromiseResponseScreenServices } from "../compromise-response-services";

export function createServices(
  overrides: Partial<CompromiseResponseScreenServices> = {},
): CompromiseResponseScreenServices {
  return {
    fetchCompromiseResponse: vi.fn(),
    startCompromiseResponse: vi.fn(),
    markItemDone: vi.fn(),
    revokeEveryInstallation: vi.fn(),
    forcePinResets: vi.fn(),
    endSessionsAndRemovePasskeys: vi.fn(),
    fetchAccounts: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

export function grantAuthorization(services: CompromiseResponseScreenServices) {
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
}

export function renderScreen(
  services: CompromiseResponseScreenServices,
  onSessionEnded: () => void = () => {},
) {
  return render(
    <main>
      <CompromiseResponseScreen services={services} onSessionEnded={onSessionEnded} />
    </main>,
  );
}
