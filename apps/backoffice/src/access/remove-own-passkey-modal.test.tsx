import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { Passkey } from "./passkey-api";
import {
  RemoveOwnPasskeyModal,
  type RemoveOwnPasskeyModalServices,
} from "./remove-own-passkey-modal";

function createServices(
  overrides: Partial<RemoveOwnPasskeyModalServices> = {},
): RemoveOwnPasskeyModalServices {
  return {
    removePasskey: vi.fn(),
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

function grantAuthorization(services: RemoveOwnPasskeyModalServices) {
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
}

async function renderModal(
  services: RemoveOwnPasskeyModalServices,
  handlers: { onRemoved?: () => void; onSessionEnded?: () => void } = {},
) {
  const screen = await render(
    <main>
      <RemoveOwnPasskeyModal
        target={notebook}
        isOnlyPasskey={false}
        onClose={() => {}}
        onRemoved={handlers.onRemoved ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>,
  );
  const dialog = screen.getByRole("dialog", { name: "¿Dar de baja la passkey?" });
  await expect.element(dialog).toBeVisible();
  return { screen, dialog };
}

test("opens the authorization modal on authorization_required, then authorizes and retries the removal", async () => {
  const services = createServices();
  vi.mocked(services.removePasskey).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.removePasskey).mockResolvedValueOnce({ kind: "ok" });
  const onRemoved = vi.fn();
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

  await expect.poll(() => vi.mocked(services.removePasskey).mock.calls.length).toBe(2);
  await expect.poll(() => onRemoved.mock.calls.length).toBe(1);
});

test("cancelling the authorization modal keeps the remove modal open, removing nothing", async () => {
  const services = createServices();
  vi.mocked(services.removePasskey).mockResolvedValue({ kind: "authorization_required" });
  const onRemoved = vi.fn();
  const { screen, dialog } = await renderModal(services, { onRemoved });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Cancelar" }));

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Autorizá este cambio" }).query())
    .toBeNull();
  await expect
    .element(screen.getByRole("dialog", { name: "¿Dar de baja la passkey?" }))
    .toBeVisible();
  expect(services.removePasskey).toHaveBeenCalledTimes(1);
  expect(onRemoved).not.toHaveBeenCalled();
});

test("treats a not_found removal as already done", async () => {
  const services = createServices();
  vi.mocked(services.removePasskey).mockResolvedValue({ kind: "not_found" });
  const onRemoved = vi.fn();
  const { dialog } = await renderModal(services, { onRemoved });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.poll(() => onRemoved.mock.calls.length).toBe(1);
});

test("shows an error inside the authorization modal, not calling removePasskey again, when the browser cancels the passkey ceremony", async () => {
  const services = createServices();
  vi.mocked(services.removePasskey).mockResolvedValue({ kind: "authorization_required" });
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
  expect(services.removePasskey).toHaveBeenCalledTimes(1);
});

test("shows a rate-limited notice when removing itself is rate limited", async () => {
  const services = createServices();
  vi.mocked(services.removePasskey).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("ends the session when authorizing the removal finds it already closed", async () => {
  const services = createServices();
  vi.mocked(services.removePasskey).mockResolvedValue({ kind: "authorization_required" });
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
  vi.mocked(services.removePasskey).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("has no accessibility violations with the remove modal open", async () => {
  const services = createServices();
  await renderModal(services);

  await expectNoAccessibilityViolations(document.body);
});
