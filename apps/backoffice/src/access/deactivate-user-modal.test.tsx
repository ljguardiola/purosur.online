import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { DeactivateUserModal, type DeactivateUserModalServices } from "./deactivate-user-modal";
import type { BranchUser } from "./users-api";

function createServices(
  overrides: Partial<DeactivateUserModalServices> = {},
): DeactivateUserModalServices {
  return {
    deactivateUser: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const lucia: BranchUser = {
  id: "user-1",
  firstName: "Lucía",
  email: "lucia.perez@purosur.online",
  version: 1,
  role: {
    id: "00000000-0000-4000-8000-000000000002",
    isAdministrator: false,
    name: "Responsable de turno",
  },
  passkeyCount: 1,
  isLastActiveAdministrator: false,
};

const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

function grantAuthorization(services: DeactivateUserModalServices) {
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
}

afterEach(() => {
  window.history.pushState(null, "", "/");
});

type Handlers = {
  onClose?: () => void;
  onDeactivated?: () => void;
  onVanished?: () => void;
  onSessionEnded?: () => void;
};

async function renderModal(services: DeactivateUserModalServices, handlers: Handlers = {}) {
  const screen = await render(
    <main>
      <DeactivateUserModal
        open
        user={lucia}
        onClose={handlers.onClose ?? (() => {})}
        onDeactivated={handlers.onDeactivated ?? (() => {})}
        onVanished={handlers.onVanished ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>,
  );
  return { screen, dialog: screen.getByRole("dialog", { name: "¿Desactivar a Lucía?" }) };
}

test("opens the deactivate modal, and Cancelar calls onClose without calling the API", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });

  await expect.element(dialog.getByText("Se puede reactivar más adelante.")).toBeVisible();
  expect(dialog.getByText("No se puede deshacer.").query()).toBeNull();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => onClose.mock.calls.length).toBe(1);
  expect(services.deactivateUser).not.toHaveBeenCalled();
});

test("deactivates directly, without the authorization modal, reporting it through onDeactivated", async () => {
  const services = createServices();
  const onDeactivated = vi.fn();
  vi.mocked(services.deactivateUser).mockResolvedValue({ kind: "ok" });
  const { screen, dialog } = await renderModal(services, { onDeactivated });

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.poll(() => vi.mocked(services.deactivateUser).mock.calls.length).toBe(1);
  expect(services.deactivateUser).toHaveBeenCalledWith("user-1");
  await expect.poll(() => onDeactivated.mock.calls.length).toBe(1);
  expect(screen.getByRole("dialog", { name: "Autorizá este cambio" }).query()).toBeNull();
});

test("opens the authorization modal on authorization_required, then authorizes and retries the deactivation", async () => {
  const services = createServices();
  const onDeactivated = vi.fn();
  vi.mocked(services.deactivateUser).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.deactivateUser).mockResolvedValueOnce({ kind: "ok" });
  const { screen, dialog } = await renderModal(services, { onDeactivated });

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await expect
    .element(
      authDialog.getByText(
        "Desactivar un usuario necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.deactivateUser).mock.calls.length).toBe(2);
  await expect.poll(() => onDeactivated.mock.calls.length).toBe(1);
});

test("cancelling the authorization modal keeps the deactivate modal open, deactivating nothing", async () => {
  const services = createServices();
  const onDeactivated = vi.fn();
  vi.mocked(services.deactivateUser).mockResolvedValue({ kind: "authorization_required" });
  const { screen, dialog } = await renderModal(services, { onDeactivated });

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Cancelar" }));

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Autorizá este cambio" }).query())
    .toBeNull();
  await expect.element(screen.getByRole("dialog", { name: "¿Desactivar a Lucía?" })).toBeVisible();
  expect(services.deactivateUser).toHaveBeenCalledTimes(1);
  expect(onDeactivated).not.toHaveBeenCalled();
});

test("ends the session when deactivating finds it already closed", async () => {
  const services = createServices();
  vi.mocked(services.deactivateUser).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta, without the authorization modal, when deactivating comes back forbidden", async () => {
  window.history.pushState(null, "", "/users/user-1");
  const services = createServices();
  vi.mocked(services.deactivateUser).mockResolvedValue({ kind: "forbidden" });
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.poll(() => window.location.pathname).toBe("/account");
  expect(services.fetchSessionAuthorizationOptions).not.toHaveBeenCalled();
});

test("shows a rate-limited notice inside the deactivate modal", async () => {
  const services = createServices();
  vi.mocked(services.deactivateUser).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("shows an attempt-failed notice inside the deactivate modal on any other failure", async () => {
  const services = createServices();
  vi.mocked(services.deactivateUser).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.element(dialog.getByText("No se pudo desactivar el usuario")).toBeVisible();
});

test("has no accessibility violations with the deactivate modal open", async () => {
  const { dialog } = await renderModal(createServices());
  await expect.element(dialog).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});
