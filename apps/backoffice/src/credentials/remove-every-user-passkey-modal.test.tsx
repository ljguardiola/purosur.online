import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  RemoveEveryUserPasskeyModal,
  type RemoveEveryUserPasskeyModalServices,
} from "./remove-every-user-passkey-modal";

function createServices(
  overrides: Partial<RemoveEveryUserPasskeyModalServices> = {},
): RemoveEveryUserPasskeyModalServices {
  return {
    removeEveryUserPasskey: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

function grantAuthorization(services: RemoveEveryUserPasskeyModalServices) {
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
}

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

type Handlers = {
  onClose?: () => void;
  onRemoved?: () => void;
  onSessionEnded?: () => void;
};

async function renderModal(
  services: RemoveEveryUserPasskeyModalServices,
  handlers: Handlers = {},
  { passkeyCount = 2, open = true }: { passkeyCount?: number; open?: boolean } = {},
) {
  const screen = await render(
    <main>
      <RemoveEveryUserPasskeyModal
        open={open}
        userId="user-1"
        userName="Lucía"
        passkeyCount={passkeyCount}
        onClose={handlers.onClose ?? (() => {})}
        onRemoved={handlers.onRemoved ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>,
  );
  return {
    screen,
    dialog: screen.getByRole("dialog", { name: "¿Dar de baja todas las passkeys de Lucía?" }),
  };
}

test("says how many passkeys stop working and that the person has to ask for the recovery link", async () => {
  const { dialog } = await renderModal(createServices());

  await expect
    .element(dialog.getByRole("heading", { name: "¿Dar de baja todas las passkeys de Lucía?" }))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Sus 2 passkeys dejan de servir para entrar y se cierran sus sesiones abiertas. Para volver a entrar, Lucía va a tener que pedir el enlace de recuperación por correo.",
      ),
    )
    .toBeVisible();
});

test("words the single passkey of an account in the singular", async () => {
  const { dialog } = await renderModal(createServices(), {}, { passkeyCount: 1 });

  await expect
    .element(
      dialog.getByText(
        "Su única passkey deja de servir para entrar y se cierran sus sesiones abiertas. Para volver a entrar, Lucía va a tener que pedir el enlace de recuperación por correo.",
      ),
    )
    .toBeVisible();
});

test("renders nothing while closed", async () => {
  const { screen } = await renderModal(createServices(), {}, { open: false });

  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("Cancelar calls onClose without removing any passkey", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => onClose.mock.calls.length).toBe(1);
  expect(services.removeEveryUserPasskey).not.toHaveBeenCalled();
});

test("removes every passkey of the user and reports it", async () => {
  const services = createServices();
  vi.mocked(services.removeEveryUserPasskey).mockResolvedValue({ kind: "ok" });
  const onRemoved = vi.fn();
  const { dialog } = await renderModal(services, { onRemoved });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja todas" }));

  await expect.poll(() => onRemoved.mock.calls.length).toBe(1);
  expect(services.removeEveryUserPasskey).toHaveBeenCalledWith("user-1");
});

test("opens the authorization modal on authorization_required, then authorizes and retries the removal", async () => {
  const services = createServices();
  const onRemoved = vi.fn();
  vi.mocked(services.removeEveryUserPasskey).mockResolvedValueOnce({
    kind: "authorization_required",
  });
  grantAuthorization(services);
  vi.mocked(services.removeEveryUserPasskey).mockResolvedValueOnce({ kind: "ok" });
  const { screen, dialog } = await renderModal(services, { onRemoved });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja todas" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await expect
    .element(
      authDialog.getByText(
        "Dar de baja todas las passkeys necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.removeEveryUserPasskey).mock.calls.length).toBe(2);
  await expect.poll(() => onRemoved.mock.calls.length).toBe(1);
});

test("cancelling the authorization modal keeps the modal open, removing nothing", async () => {
  const services = createServices();
  const onRemoved = vi.fn();
  vi.mocked(services.removeEveryUserPasskey).mockResolvedValue({
    kind: "authorization_required",
  });
  const { screen, dialog } = await renderModal(services, { onRemoved });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja todas" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await userEvent.click(authDialog.getByRole("button", { name: "Cancelar" }));

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Autorizá este cambio" }).query())
    .toBeNull();
  await expect
    .element(screen.getByRole("dialog", { name: "¿Dar de baja todas las passkeys de Lucía?" }))
    .toBeVisible();
  expect(services.removeEveryUserPasskey).toHaveBeenCalledTimes(1);
  expect(onRemoved).not.toHaveBeenCalled();
});

test("ends the session when removing finds it already closed", async () => {
  const services = createServices();
  vi.mocked(services.removeEveryUserPasskey).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja todas" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta, without the authorization modal, when the removal comes back forbidden", async () => {
  window.history.pushState(null, "", "/users/user-1");
  const services = createServices();
  vi.mocked(services.removeEveryUserPasskey).mockResolvedValue({ kind: "forbidden" });
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja todas" }));

  await expect.poll(() => window.location.pathname).toBe("/account");
  expect(services.fetchSessionAuthorizationOptions).not.toHaveBeenCalled();
});

test("treats an account with no passkeys left as already done, reporting it through onRemoved", async () => {
  const services = createServices();
  vi.mocked(services.removeEveryUserPasskey).mockResolvedValue({ kind: "no_passkeys" });
  const onRemoved = vi.fn();
  const { dialog } = await renderModal(services, { onRemoved });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja todas" }));

  await expect.poll(() => onRemoved.mock.calls.length).toBe(1);
});

test("treats a user that no longer exists as already done, reporting it through onRemoved", async () => {
  const services = createServices();
  vi.mocked(services.removeEveryUserPasskey).mockResolvedValue({ kind: "not_found" });
  const onRemoved = vi.fn();
  const { dialog } = await renderModal(services, { onRemoved });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja todas" }));

  await expect.poll(() => onRemoved.mock.calls.length).toBe(1);
});

test("tells the person that their own passkeys cannot be removed from here", async () => {
  const services = createServices();
  vi.mocked(services.removeEveryUserPasskey).mockResolvedValue({ kind: "own_account" });
  const onRemoved = vi.fn();
  const { dialog } = await renderModal(services, { onRemoved });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja todas" }));

  await expect.element(dialog.getByText("No podés dar de baja tus propias passkeys")).toBeVisible();
  await expect.element(dialog.getByText("Hacelo desde Mi cuenta.")).toBeVisible();
  expect(onRemoved).not.toHaveBeenCalled();
});

test("shows when to retry after a rate-limited answer", async () => {
  const services = createServices();
  vi.mocked(services.removeEveryUserPasskey).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja todas" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("shows an inline failure and keeps the modal open when the passkeys could not be removed", async () => {
  const services = createServices();
  vi.mocked(services.removeEveryUserPasskey).mockResolvedValue({ kind: "failed" });
  const onRemoved = vi.fn();
  const { dialog } = await renderModal(services, { onRemoved });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja todas" }));

  await expect.element(dialog.getByText("No se pudieron dar de baja las passkeys")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
  expect(onRemoved).not.toHaveBeenCalled();
});
