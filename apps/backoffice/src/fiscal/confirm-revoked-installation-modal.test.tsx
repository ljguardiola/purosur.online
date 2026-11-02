import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { OUTDATED_TAB_ADVICE, openAsOutdatedTab } from "../platform/test-support/release-monitor";
import { render } from "../shell/test-support/render-with-router";
import {
  ConfirmRevokedInstallationModal,
  type ConfirmRevokedInstallationModalServices,
} from "./confirm-revoked-installation-modal";
import type { RevokedInstallationTarget } from "./revoked-installation-target";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const target: RevokedInstallationTarget = {
  registerName: "Caja 1",
  pointOfSaleNumber: 4,
  fortnight: { start: "2026-09-01", end: "2026-09-15" },
  installationId: "inst-1",
  revokedAt: "2026-09-10T15:30:00.000Z",
};

const title = "Confirmar la instalación revocada";

function createServices(): ConfirmRevokedInstallationModalServices {
  return {
    confirmRevokedInstallation: vi.fn(),
    fetchSessionAuthorizationOptions: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: { challenge: "session-auth" } }),
    authorizeSession: vi.fn().mockResolvedValue({ kind: "ok" }),
    startAuthentication: vi.fn().mockResolvedValue({ id: "existing-cred" }),
  };
}

type Handlers = {
  target?: RevokedInstallationTarget | null;
  onClose?: () => void;
  onConfirmed?: (confirmed: RevokedInstallationTarget) => void;
  onOutdated?: () => void;
  onSessionEnded?: () => void;
};

async function renderModal(
  services: ConfirmRevokedInstallationModalServices,
  handlers: Handlers = {},
) {
  const screen = await render(
    <main>
      <ConfirmRevokedInstallationModal
        target={handlers.target === undefined ? target : handlers.target}
        onClose={handlers.onClose ?? (() => {})}
        onConfirmed={handlers.onConfirmed ?? (() => {})}
        onOutdated={handlers.onOutdated ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>,
  );
  const dialog = screen.getByRole("dialog", { name: title });
  await expect.element(dialog).toBeVisible();
  return { screen, dialog };
}

type Dialog = Awaited<ReturnType<typeof renderModal>>["dialog"];

async function confirm(dialog: Dialog) {
  await userEvent.click(dialog.getByRole("button", { name: "Confirmar", exact: true }));
}

test("names the register and when its installation was revoked, asks to confirm it issued no document that did not reach the cloud and warns about the report", async () => {
  const { dialog } = await renderModal(createServices());

  await expect
    .element(
      dialog.getByText(
        "La instalación de Caja 1 se revocó el 10/09/2026 · 12:30. Confirmá que no emitió ningún comprobante sin conexión que no haya llegado a la nube.",
        { exact: true },
      ),
    )
    .toBeVisible();
  await expect
    .element(
      dialog
        .getByText("Si emitió alguno, el informe a ARCA quedaría incompleto.", { exact: true })
        .first(),
    )
    .toBeVisible();
});

test("has no accessibility violations", async () => {
  const { dialog } = await renderModal(createServices());

  await expectNoAccessibilityViolations(dialog.element());
});

test("is closed without an installation to confirm", async () => {
  const screen = await render(
    <main>
      <ConfirmRevokedInstallationModal
        target={null}
        onClose={() => {}}
        onConfirmed={() => {}}
        onOutdated={() => {}}
        onSessionEnded={() => {}}
        services={createServices()}
      />
    </main>,
  );

  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("confirms the installation of the fortnight, closes and reports it confirmed", async () => {
  const services = createServices();
  vi.mocked(services.confirmRevokedInstallation).mockResolvedValue({ kind: "ok" });
  const onClose = vi.fn();
  const onConfirmed = vi.fn();
  const { dialog } = await renderModal(services, { onClose, onConfirmed });

  await confirm(dialog);

  await expect.poll(() => onConfirmed.mock.calls.length).toBe(1);
  expect(onConfirmed).toHaveBeenCalledWith(target);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.confirmRevokedInstallation).toHaveBeenCalledWith({
    point_of_sale_number: 4,
    fortnight_start: "2026-09-01",
    installation_id: "inst-1",
  });
});

test("cancelling closes without confirming", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.confirmRevokedInstallation).not.toHaveBeenCalled();
});

test("asks for the passkey on authorization_required, then authorizes and retries", async () => {
  const services = createServices();
  vi.mocked(services.confirmRevokedInstallation)
    .mockResolvedValueOnce({ kind: "authorization_required" })
    .mockResolvedValueOnce({ kind: "ok" });
  const onConfirmed = vi.fn();
  const { screen, dialog } = await renderModal(services, { onConfirmed });

  await confirm(dialog);
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect
    .element(
      authDialog.getByText(
        "Confirmar la instalación revocada necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.confirmRevokedInstallation).mock.calls.length).toBe(2);
  await expect.poll(() => onConfirmed.mock.calls.length).toBe(1);
});

test.each([
  ["already_confirmed", "Alguien ya confirmó esta instalación para este informe."],
  ["already_presented", "Este informe ya siguió su curso."],
  ["not_revoked", "Esta instalación ya no frena el informe."],
  ["not_holding_back", "Esta instalación ya no frena el informe."],
  ["not_found", "Esta instalación ya no frena el informe."],
  [
    "holds_unapplied_events",
    "La nube todavía no terminó de procesar lo que esta instalación sincronizó.",
  ],
] as const)(
  "explains the %s refusal, keeps the modal open and asks the screen to refresh",
  async (kind, message) => {
    const services = createServices();
    vi.mocked(services.confirmRevokedInstallation).mockResolvedValue({ kind });
    const onClose = vi.fn();
    const onOutdated = vi.fn();
    const onConfirmed = vi.fn();
    const { dialog } = await renderModal(services, { onClose, onOutdated, onConfirmed });

    await confirm(dialog);

    await expect.element(dialog.getByText(message).first()).toBeVisible();
    expect(onOutdated).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
  },
);

test("shows the attempt-failed notice when the cloud refuses the request's shape", async () => {
  const services = createServices();
  vi.mocked(services.confirmRevokedInstallation).mockResolvedValue({
    kind: "validation_failed",
    field: "installation_id",
  });
  const { dialog } = await renderModal(services);

  await confirm(dialog);

  await expect
    .element(dialog.getByText("No se pudo confirmar la instalación revocada"))
    .toBeVisible();
});

test("shows the rate-limited notice", async () => {
  const services = createServices();
  vi.mocked(services.confirmRevokedInstallation).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const { dialog } = await renderModal(services);

  await confirm(dialog);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("shows the attempt-failed notice", async () => {
  const services = createServices();
  vi.mocked(services.confirmRevokedInstallation).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal(services);

  await confirm(dialog);

  await expect
    .element(dialog.getByText("No se pudo confirmar la instalación revocada"))
    .toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
});

test("ends the session when the cloud no longer knows it", async () => {
  const services = createServices();
  vi.mocked(services.confirmRevokedInstallation).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await confirm(dialog);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("tells an outdated tab to reload because the backoffice was updated when the confirmation is refused", async () => {
  openAsOutdatedTab();
  const services = createServices();
  vi.mocked(services.confirmRevokedInstallation).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal(services);

  await confirm(dialog);

  await expect.element(dialog.getByText(OUTDATED_TAB_ADVICE)).toBeVisible();
  expect(dialog.getByText("Probá de nuevo.").query()).toBeNull();
});
