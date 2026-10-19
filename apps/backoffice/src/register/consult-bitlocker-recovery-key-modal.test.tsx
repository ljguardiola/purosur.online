import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { ConsultBitlockerRecoveryKeyModal } from "./consult-bitlocker-recovery-key-modal";
import type { ConsultBitlockerRecoveryKeyOutcome, RegisterSummary } from "./registers-api";
import type { RegistersListScreenServices } from "./registers-list-services";
import {
  createServices,
  grantAuthorization,
  registerWithBitlockerKey,
} from "./test-support/registers-list-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const FIRST_LINE = "111111-222222-333333-444444";
const SECOND_LINE = "555555-666666-707707-110000";
const TITLE = "Clave de recuperación de BitLocker";
const KEY_OUTCOME: ConsultBitlockerRecoveryKeyOutcome = {
  kind: "ok",
  value: { recoveryKey: `${FIRST_LINE}-${SECOND_LINE}`, keyIdentifier: "1A2B3C4D" },
};

type Handlers = {
  target?: RegisterSummary | null;
  onClose?: () => void;
  onOutdated?: () => void;
  onSessionEnded?: () => void;
};

function modalFor(services: RegistersListScreenServices, handlers: Handlers = {}) {
  return (
    <main>
      <ConsultBitlockerRecoveryKeyModal
        target={handlers.target === undefined ? registerWithBitlockerKey : handlers.target}
        onClose={handlers.onClose ?? (() => {})}
        onOutdated={handlers.onOutdated ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>
  );
}

async function renderModal(services: RegistersListScreenServices, handlers: Handlers = {}) {
  const screen = await render(modalFor(services, handlers));
  const dialog = screen.getByRole("dialog", { name: TITLE });
  await expect.element(dialog).toBeVisible();
  return { screen, dialog };
}

test("shows the key in two lines of four blocks with its identifier and when it is used", async () => {
  const services = createServices();
  vi.mocked(services.consultBitlockerRecoveryKey).mockResolvedValue(KEY_OUTCOME);

  const { dialog } = await renderModal(services);

  await expect
    .element(dialog.getByText("Caja 5 · NOTEBOOK-MOSTRADOR", { exact: true }))
    .toBeVisible();
  await expect.element(dialog.getByText(FIRST_LINE, { exact: true })).toBeVisible();
  await expect.element(dialog.getByText(SECOND_LINE, { exact: true })).toBeVisible();
  await expect.element(dialog.getByText("Identificador de la clave: 1A2B3C4D")).toBeVisible();
  await expect
    .element(
      dialog
        .getByText(
          "Se usa solo si Windows la pide al arrancar la notebook, por ejemplo después de un cambio de hardware.",
        )
        .first(),
    )
    .toBeVisible();
  expect(services.consultBitlockerRecoveryKey).toHaveBeenCalledWith("register-5");
});

test("has no accessibility violations once the key is shown", async () => {
  const services = createServices();
  vi.mocked(services.consultBitlockerRecoveryKey).mockResolvedValue(KEY_OUTCOME);
  const { dialog } = await renderModal(services);
  await expect.element(dialog.getByText(FIRST_LINE, { exact: true })).toBeVisible();

  await expectNoAccessibilityViolations(dialog.element());
});

test("is closed and asks for nothing without a register", async () => {
  const services = createServices();

  const screen = await render(modalFor(services, { target: null }));

  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.consultBitlockerRecoveryKey).not.toHaveBeenCalled();
});

test("shows no key while it is being requested", async () => {
  const services = createServices();
  vi.mocked(services.consultBitlockerRecoveryKey).mockReturnValue(new Promise(() => {}));

  const { dialog } = await renderModal(services);

  await expect.element(dialog.getByText(FIRST_LINE)).not.toBeInTheDocument();
  await expect.element(dialog.getByRole("button", { name: "Listo" })).toBeDisabled();
});

test("Listo closes the modal", async () => {
  const services = createServices();
  vi.mocked(services.consultBitlockerRecoveryKey).mockResolvedValue(KEY_OUTCOME);
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });
  await expect.element(dialog.getByText(FIRST_LINE, { exact: true })).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Listo" }));

  expect(onClose).toHaveBeenCalledTimes(1);
});

test("opens the authorization modal on authorization_required, then authorizes and shows the key", async () => {
  const services = createServices();
  vi.mocked(services.consultBitlockerRecoveryKey).mockResolvedValueOnce({
    kind: "authorization_required",
  });
  vi.mocked(services.consultBitlockerRecoveryKey).mockResolvedValueOnce(KEY_OUTCOME);
  grantAuthorization(services);
  const { screen, dialog } = await renderModal(services);

  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await expect
    .element(
      authDialog.getByText(
        "Consultar la clave de recuperación de BitLocker necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.element(dialog.getByText(FIRST_LINE, { exact: true })).toBeVisible();
  expect(services.consultBitlockerRecoveryKey).toHaveBeenCalledTimes(2);
});

test("cancelling the authorization closes the modal without a key", async () => {
  const services = createServices();
  vi.mocked(services.consultBitlockerRecoveryKey).mockResolvedValue({
    kind: "authorization_required",
  });
  const onClose = vi.fn();
  const { screen } = await renderModal(services, { onClose });

  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Autorizá este cambio" })
      .getByRole("button", { name: "Cancelar" }),
  );

  await expect.poll(() => onClose.mock.calls.length).toBe(1);
});

test.each([
  ["not_loaded", "La caja no tiene una clave de recuperación cargada."],
  ["no_current_installation", "La caja ya no tiene una instalación activa."],
  ["not_found", "No se encontró la caja."],
] as const)("explains a %s answer and reports the list outdated", async (kind, description) => {
  const services = createServices();
  vi.mocked(services.consultBitlockerRecoveryKey).mockResolvedValue({ kind });
  const onOutdated = vi.fn();
  const { dialog } = await renderModal(services, { onOutdated });

  await expect.element(dialog.getByText("No se pudo consultar la clave")).toBeVisible();
  await expect.element(dialog.getByText(description)).toBeVisible();
  expect(onOutdated).toHaveBeenCalledTimes(1);
});

test("shows the rate-limited notice", async () => {
  const services = createServices();
  vi.mocked(services.consultBitlockerRecoveryKey).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const { dialog } = await renderModal(services);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("shows the attempt-failed notice", async () => {
  const services = createServices();
  vi.mocked(services.consultBitlockerRecoveryKey).mockResolvedValue({ kind: "failed" });

  const { dialog } = await renderModal(services);

  await expect.element(dialog.getByText("No se pudo consultar la clave")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
});

test("ends the session when the consultation finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.consultBitlockerRecoveryKey).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderModal(services, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("asks again, and shows no earlier key, when it is opened again", async () => {
  const services = createServices();
  vi.mocked(services.consultBitlockerRecoveryKey).mockResolvedValueOnce(KEY_OUTCOME);
  vi.mocked(services.consultBitlockerRecoveryKey).mockReturnValueOnce(new Promise(() => {}));
  const screen = await render(modalFor(services, { target: null }));
  await screen.rerender(modalFor(services));
  await expect.element(screen.getByText(FIRST_LINE, { exact: true })).toBeVisible();

  await screen.rerender(modalFor(services, { target: null }));
  await screen.rerender(modalFor(services));

  await expect.element(screen.getByText(FIRST_LINE)).not.toBeInTheDocument();
  expect(services.consultBitlockerRecoveryKey).toHaveBeenCalledTimes(2);
});
