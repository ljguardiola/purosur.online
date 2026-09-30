import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { Passkey } from "./passkey-api";
import {
  RemoveUserPasskeyModal,
  type RemoveUserPasskeyModalServices,
} from "./remove-user-passkey-modal";

function createServices(
  overrides: Partial<RemoveUserPasskeyModalServices> = {},
): RemoveUserPasskeyModalServices {
  return {
    removeUserPasskey: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const notebook: Passkey = {
  id: "pk-1",
  name: "Notebook del local",
  createdAt: "2026-08-02T12:00:00.000Z",
  lastUsedAt: "2026-09-23T12:12:00.000Z",
};

const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

function grantAuthorization(services: RemoveUserPasskeyModalServices) {
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
  onRemoved?: (passkeyId: string) => void;
  onSessionEnded?: () => void;
};

async function renderModal(services: RemoveUserPasskeyModalServices, handlers: Handlers = {}) {
  const screen = await render(
    <main>
      <RemoveUserPasskeyModal
        target={notebook}
        userId="user-1"
        userName="Lucía"
        isOnlyPasskey={false}
        onClose={handlers.onClose ?? (() => {})}
        onRemoved={handlers.onRemoved ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>,
  );
  return {
    screen,
    dialog: screen.getByRole("dialog", { name: "¿Dar de baja la passkey de Lucía?" }),
  };
}

test("opens the remove modal titled and worded for the target user and passkey", async () => {
  const { dialog } = await renderModal(createServices());

  await expect
    .element(dialog.getByRole("heading", { name: "¿Dar de baja la passkey de Lucía?" }))
    .toBeVisible();
  await expect
    .element(dialog.getByText("«Notebook del local» deja de servir para entrar."))
    .toBeVisible();
  expect(dialog.getByText(/Es su única passkey/).query()).toBeNull();
});

test("opens the authorization modal on authorization_required, then authorizes and retries the removal", async () => {
  const services = createServices();
  const onRemoved = vi.fn();
  vi.mocked(services.removeUserPasskey).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.removeUserPasskey).mockResolvedValueOnce({ kind: "ok" });
  const { screen, dialog } = await renderModal(services, { onRemoved });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await expect
    .element(
      authDialog.getByText(
        "Dar de baja una passkey necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.removeUserPasskey).mock.calls.length).toBe(2);
  expect(services.removeUserPasskey).toHaveBeenLastCalledWith("user-1", "pk-1");
  await expect.poll(() => onRemoved.mock.calls).toEqual([["pk-1"]]);
  await expect
    .poll(() => screen.getByRole("dialog", { name: "Autorizá este cambio" }).query())
    .toBeNull();
});

test("cancelling the authorization modal keeps the remove modal open, removing nothing", async () => {
  const services = createServices();
  const onRemoved = vi.fn();
  vi.mocked(services.removeUserPasskey).mockResolvedValue({ kind: "authorization_required" });
  const { screen, dialog } = await renderModal(services, { onRemoved });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Cancelar" }));

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Autorizá este cambio" }).query())
    .toBeNull();
  await expect
    .element(screen.getByRole("dialog", { name: "¿Dar de baja la passkey de Lucía?" }))
    .toBeVisible();
  expect(services.removeUserPasskey).toHaveBeenCalledTimes(1);
  expect(onRemoved).not.toHaveBeenCalled();
});

test("Cancelar calls onClose without calling the remove API", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => onClose.mock.calls.length).toBe(1);
  expect(services.removeUserPasskey).not.toHaveBeenCalled();
});

test("treats a removal 404 as already gone, reporting it through onRemoved", async () => {
  const services = createServices();
  const onRemoved = vi.fn();
  vi.mocked(services.removeUserPasskey).mockResolvedValue({ kind: "not_found" });
  const { dialog } = await renderModal(services, { onRemoved });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.poll(() => onRemoved.mock.calls).toEqual([["pk-1"]]);
});

test("shows an error inside the authorization modal, not calling removeUserPasskey again, when the browser cancels the passkey ceremony", async () => {
  const services = createServices();
  vi.mocked(services.removeUserPasskey).mockResolvedValue({ kind: "authorization_required" });
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockRejectedValue(new Error("NotAllowedError"));
  const { screen, dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.element(authDialog.getByText("No se pudo confirmar con tu passkey")).toBeVisible();
  expect(services.removeUserPasskey).toHaveBeenCalledTimes(1);
});

test("ends the session when authorizing the removal finds it already closed", async () => {
  const services = createServices();
  vi.mocked(services.removeUserPasskey).mockResolvedValue({ kind: "authorization_required" });
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();
  const { screen, dialog } = await renderModal(services, { onSessionEnded });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("ends the session when removing finds it already closed", async () => {
  const services = createServices();
  vi.mocked(services.removeUserPasskey).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta, without the authorization modal, when removing the passkey comes back forbidden", async () => {
  window.history.pushState(null, "", "/users/user-1");
  const services = createServices();
  vi.mocked(services.removeUserPasskey).mockResolvedValue({ kind: "forbidden" });
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.poll(() => window.location.pathname).toBe("/account");
  expect(services.fetchSessionAuthorizationOptions).not.toHaveBeenCalled();
});

test("navigates to Mi cuenta when the removal retried after the authorization comes back forbidden", async () => {
  window.history.pushState(null, "", "/users/user-1");
  const services = createServices();
  vi.mocked(services.removeUserPasskey).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.removeUserPasskey).mockResolvedValueOnce({ kind: "forbidden" });
  const { screen, dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Autorizá este cambio" })
      .getByRole("button", { name: "Usar mi passkey" }),
  );

  await expect.poll(() => window.location.pathname).toBe("/account");
});
