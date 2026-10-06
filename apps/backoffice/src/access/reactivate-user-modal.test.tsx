import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { ReactivateUserModal, type ReactivateUserModalServices } from "./reactivate-user-modal";
import type { BranchUser } from "./users-api";

function createServices(
  overrides: Partial<ReactivateUserModalServices> = {},
): ReactivateUserModalServices {
  return {
    reactivateUser: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const sofia: BranchUser = {
  id: "user-5",
  firstName: "Sofía Díaz",
  email: "sofia.diaz@purosur.online",
  version: 1,
  active: false,
  role: {
    id: "00000000-0000-4000-8000-000000000002",
    isAdministrator: false,
    name: "Responsable de turno",
  },
  passkeyCount: 1,
  isLastActiveAdministrator: false,
  mayEmitPinCode: true,
  mayEdit: false,
  mayDeactivate: false,
  mayReactivate: true,
  mayRemovePasskey: false,
};

afterEach(() => {
  window.history.pushState(null, "", "/");
});

type Handlers = {
  onClose?: () => void;
  onReactivated?: () => void;
  onSessionEnded?: () => void;
};

async function renderModal(services: ReactivateUserModalServices, handlers: Handlers = {}) {
  const screen = await render(
    <main>
      <ReactivateUserModal
        open
        user={sofia}
        onClose={handlers.onClose ?? (() => {})}
        onReactivated={handlers.onReactivated ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>,
  );
  return { screen, dialog: screen.getByRole("dialog", { name: "¿Reactivar a Sofía Díaz?" }) };
}

test("opens the reactivate modal, and Cancelar calls onClose without calling the API", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });

  await expect
    .element(
      dialog.getByText(
        "Vuelve a entrar a la caja y al backoffice con su mismo correo, rol y passkeys.",
      ),
    )
    .toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => onClose.mock.calls.length).toBe(1);
  expect(services.reactivateUser).not.toHaveBeenCalled();
});

test("reactivates directly, without the authorization modal, reporting it through onReactivated", async () => {
  const services = createServices();
  const onReactivated = vi.fn();
  vi.mocked(services.reactivateUser).mockResolvedValue({ kind: "ok" });
  const { screen, dialog } = await renderModal(services, { onReactivated });

  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect.poll(() => vi.mocked(services.reactivateUser).mock.calls.length).toBe(1);
  expect(services.reactivateUser).toHaveBeenCalledWith("user-5");
  await expect.poll(() => onReactivated.mock.calls.length).toBe(1);
  expect(screen.getByRole("dialog", { name: "Autorizá este cambio" }).query()).toBeNull();
});

test("opens the authorization modal for the reactivation action on authorization_required", async () => {
  const services = createServices();
  vi.mocked(services.reactivateUser).mockResolvedValue({ kind: "authorization_required" });
  const { screen, dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect
    .element(
      screen
        .getByRole("dialog", { name: "Autorizá este cambio" })
        .getByText("Reactivar un usuario necesita tu autorización. Confirmala con tu passkey."),
    )
    .toBeVisible();
});

test("ends the session when reactivating finds it already closed", async () => {
  const services = createServices();
  vi.mocked(services.reactivateUser).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta, without the authorization modal, when reactivating comes back forbidden", async () => {
  window.history.pushState(null, "", "/users/user-5");
  const services = createServices();
  vi.mocked(services.reactivateUser).mockResolvedValue({ kind: "forbidden" });
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect.poll(() => window.location.pathname).toBe("/account");
  expect(services.fetchSessionAuthorizationOptions).not.toHaveBeenCalled();
});

test("shows a rate-limited notice inside the reactivate modal", async () => {
  const services = createServices();
  vi.mocked(services.reactivateUser).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("shows an attempt-failed notice inside the reactivate modal on any other failure", async () => {
  const services = createServices();
  vi.mocked(services.reactivateUser).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect.element(dialog.getByText("No se pudo reactivar el usuario")).toBeVisible();
});

test("has no accessibility violations with the reactivate modal open", async () => {
  const { dialog } = await renderModal(createServices());
  await expect.element(dialog).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});
