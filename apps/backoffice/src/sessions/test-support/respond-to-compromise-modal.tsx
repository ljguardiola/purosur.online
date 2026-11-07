import { vi } from "vitest";
import { render } from "../../shell/test-support/render-with-router";
import { RespondToCompromiseModal } from "../respond-to-compromise-modal";
import type { RespondToCompromiseModalServices } from "../respond-to-compromise-modal-services";

export function createServices(
  overrides: Partial<RespondToCompromiseModalServices> = {},
): RespondToCompromiseModalServices {
  return {
    fetchCompromiseResponse: vi.fn(),
    startCompromiseResponse: vi.fn(),
    markItemDone: vi.fn(),
    revokeEveryInstallation: vi.fn(),
    forcePinResets: vi.fn(),
    endSessionsAndRemovePasskeys: vi.fn(),
    fetchUsers: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

export function grantAuthorization(services: RespondToCompromiseModalServices) {
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
}

export function renderScreen(
  services: RespondToCompromiseModalServices,
  onSessionEnded: () => void = () => {},
  onClose: () => void = () => {},
) {
  return render(
    <main>
      <RespondToCompromiseModal
        services={services}
        onSessionEnded={onSessionEnded}
        onClose={onClose}
      />
    </main>,
  );
}
