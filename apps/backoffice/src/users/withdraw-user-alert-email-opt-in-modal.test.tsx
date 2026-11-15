import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { OUTDATED_TAB_ADVICE, openAsOutdatedTab } from "../platform/test-support/release-monitor";
import { render } from "../shell/test-support/render-with-router";
import { lucia } from "./test-support/user-panel";
import {
  WithdrawUserAlertEmailOptInModal,
  type WithdrawUserAlertEmailOptInModalServices,
} from "./withdraw-user-alert-email-opt-in-modal";

function createServices(): WithdrawUserAlertEmailOptInModalServices {
  return {
    withdrawUserAlertEmailOptIn: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
  };
}

const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

function grantAuthorization(services: WithdrawUserAlertEmailOptInModalServices) {
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
  onWithdrawn?: () => void;
  onVanished?: () => void;
  onSessionEnded?: () => void;
};

async function renderModal(
  services: WithdrawUserAlertEmailOptInModalServices,
  handlers: Handlers = {},
) {
  const screen = await render(
    <main>
      <WithdrawUserAlertEmailOptInModal
        open
        user={lucia}
        onClose={handlers.onClose ?? (() => {})}
        onWithdrawn={handlers.onWithdrawn ?? (() => {})}
        onVanished={handlers.onVanished ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>,
  );
  return {
    screen,
    dialog: screen.getByRole("dialog", { name: "¿Dejar de enviar alertas por email a Lucía?" }),
  };
}

test("asks whether to stop alerting the user by email, saying the user stays as is", async () => {
  const { dialog } = await renderModal(createServices());

  await expect
    .element(
      dialog.getByText(
        "Lucía deja de recibir alertas por email. Sigue activa y su historial queda igual.",
      ),
    )
    .toBeVisible();
});

test("withdraws the opt-in of that user and reports it", async () => {
  const services = createServices();
  vi.mocked(services.withdrawUserAlertEmailOptIn).mockResolvedValue({ kind: "ok" });
  const onWithdrawn = vi.fn();
  const { dialog } = await renderModal(services, { onWithdrawn });

  await userEvent.click(dialog.getByRole("button", { name: "Dejar de recibir alertas por email" }));

  await expect.poll(() => onWithdrawn.mock.calls.length).toBe(1);
  expect(services.withdrawUserAlertEmailOptIn).toHaveBeenCalledWith("user-1");
});

test("opens the authorization modal first, withdrawing nothing until it is given", async () => {
  const services = createServices();
  vi.mocked(services.withdrawUserAlertEmailOptIn).mockResolvedValueOnce({
    kind: "authorization_required",
  });
  vi.mocked(services.withdrawUserAlertEmailOptIn).mockResolvedValueOnce({ kind: "ok" });
  grantAuthorization(services);
  const onWithdrawn = vi.fn();
  const { screen, dialog } = await renderModal(services, { onWithdrawn });

  await userEvent.click(dialog.getByRole("button", { name: "Dejar de recibir alertas por email" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect
    .element(
      authDialog.getByText(
        "Dejar de recibir alertas por email necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();
  expect(onWithdrawn).not.toHaveBeenCalled();

  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect
    .poll(() => vi.mocked(services.withdrawUserAlertEmailOptIn).mock.calls.length)
    .toBe(2);
  await expect.poll(() => onWithdrawn.mock.calls.length).toBe(1);
});

test("cancelling the authorization modal keeps this modal open, withdrawing nothing", async () => {
  const services = createServices();
  vi.mocked(services.withdrawUserAlertEmailOptIn).mockResolvedValue({
    kind: "authorization_required",
  });
  const onWithdrawn = vi.fn();
  const { screen, dialog } = await renderModal(services, { onWithdrawn });

  await userEvent.click(dialog.getByRole("button", { name: "Dejar de recibir alertas por email" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await userEvent.click(authDialog.getByRole("button", { name: "Cancelar" }));

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Autorizá este cambio" }).query())
    .toBeNull();
  await expect.element(dialog).toBeVisible();
  expect(onWithdrawn).not.toHaveBeenCalled();
});

test("reports a user that no longer exists", async () => {
  const services = createServices();
  vi.mocked(services.withdrawUserAlertEmailOptIn).mockResolvedValue({ kind: "not_found" });
  const onVanished = vi.fn();
  const { dialog } = await renderModal(services, { onVanished });

  await userEvent.click(dialog.getByRole("button", { name: "Dejar de recibir alertas por email" }));

  await expect.poll(() => onVanished.mock.calls.length).toBe(1);
});

test("ends the session when the withdrawal finds it closed", async () => {
  const services = createServices();
  vi.mocked(services.withdrawUserAlertEmailOptIn).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await userEvent.click(dialog.getByRole("button", { name: "Dejar de recibir alertas por email" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("shows a failure notice when the withdrawal fails, keeping the modal open", async () => {
  const services = createServices();
  vi.mocked(services.withdrawUserAlertEmailOptIn).mockResolvedValue({ kind: "failed" });
  const onWithdrawn = vi.fn();
  const { dialog } = await renderModal(services, { onWithdrawn });

  await userEvent.click(dialog.getByRole("button", { name: "Dejar de recibir alertas por email" }));

  await expect
    .element(dialog.getByText("No se pudo hacer que Lucía deje de recibir alertas por email"))
    .toBeVisible();
  expect(onWithdrawn).not.toHaveBeenCalled();
});

test("shows the outdated-tab advice on a failure once a newer release is deployed", async () => {
  const services = createServices();
  vi.mocked(services.withdrawUserAlertEmailOptIn).mockResolvedValue({ kind: "failed" });
  openAsOutdatedTab();
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Dejar de recibir alertas por email" }));

  await expect.element(dialog.getByText(OUTDATED_TAB_ADVICE)).toBeVisible();
});

test("shows when the withdrawal can be tried again after a rate limit", async () => {
  const services = createServices();
  vi.mocked(services.withdrawUserAlertEmailOptIn).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 60,
  });
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Dejar de recibir alertas por email" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
});

test("closes through Cancelar without withdrawing", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.withdrawUserAlertEmailOptIn).not.toHaveBeenCalled();
});
