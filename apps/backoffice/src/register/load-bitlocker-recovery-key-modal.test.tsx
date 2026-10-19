import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { LoadBitlockerRecoveryKeyModal } from "./load-bitlocker-recovery-key-modal";
import type { RegisterSummary } from "./registers-api";
import type { RegistersListScreenServices } from "./registers-list-services";
import {
  createServices,
  enrolledRegister,
  grantAuthorization,
} from "./test-support/registers-list-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const KEY = "111111-222222-333333-444444-555555-666666-707707-110000";
const TITLE = "Cargar clave de recuperación de BitLocker";

type Handlers = {
  target?: RegisterSummary | null;
  onClose?: () => void;
  onLoaded?: () => void;
  onOutdated?: () => void;
  onSessionEnded?: () => void;
};

async function renderModal(services: RegistersListScreenServices, handlers: Handlers = {}) {
  const screen = await render(
    <main>
      <LoadBitlockerRecoveryKeyModal
        target={handlers.target === undefined ? enrolledRegister : handlers.target}
        onClose={handlers.onClose ?? (() => {})}
        onLoaded={handlers.onLoaded ?? (() => {})}
        onOutdated={handlers.onOutdated ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>,
  );
  const dialog = screen.getByRole("dialog", { name: TITLE });
  await expect.element(dialog).toBeVisible();
  return { screen, dialog };
}

type Dialog = Awaited<ReturnType<typeof renderModal>>["dialog"];

async function typeAndSave(dialog: Dialog, key: string, identifier: string) {
  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Clave de recuperación de BitLocker/ }),
    key,
  );
  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Identificador de la clave/ }),
    identifier,
  );
  await userEvent.click(dialog.getByRole("button", { name: "Guardar la clave" }));
}

test("names the register and its machine and says why to keep the key", async () => {
  const { dialog } = await renderModal(createServices());

  await expect.element(dialog.getByText("Caja 3 · CAJA-MOSTRADOR", { exact: true })).toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Guardala para poder consultarla más adelante si Windows la pide al arrancar la notebook, por ejemplo después de un cambio de hardware.",
      ),
    )
    .toBeVisible();
});

test("has no accessibility violations", async () => {
  const { dialog } = await renderModal(createServices());

  await expectNoAccessibilityViolations(dialog.element());
});

test("is closed without a register to load the key for", async () => {
  const screen = await render(
    <LoadBitlockerRecoveryKeyModal
      target={null}
      onClose={() => {}}
      onLoaded={() => {}}
      onOutdated={() => {}}
      onSessionEnded={() => {}}
      services={createServices()}
    />,
  );

  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("saves the typed key and the identifier in uppercase, then reports it loaded and closes", async () => {
  const services = createServices();
  vi.mocked(services.loadBitlockerRecoveryKey).mockResolvedValue({ kind: "ok" });
  const onLoaded = vi.fn();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onLoaded, onClose });

  await typeAndSave(dialog, ` ${KEY} `, "1a2b3c4d");

  await expect.poll(() => onLoaded.mock.calls.length).toBe(1);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.loadBitlockerRecoveryKey).toHaveBeenCalledWith("register-3", {
    recovery_key: KEY,
    key_identifier: "1A2B3C4D",
  });
});

test("asks for both values and sends nothing when nothing is typed", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);

  await userEvent.click(dialog.getByRole("button", { name: "Guardar la clave" }));

  await expect
    .element(
      dialog.getByText(
        "Ingresá la clave de 48 dígitos en ocho bloques de seis, separados por guiones.",
      ),
    )
    .toBeVisible();
  await expect
    .element(dialog.getByText("Ingresá los 8 caracteres del identificador."))
    .toBeVisible();
  expect(services.loadBitlockerRecoveryKey).not.toHaveBeenCalled();
});

test("asks to review a key that does not fit and sends nothing", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);

  await typeAndSave(dialog, "123456", "1A2B3C4D");

  await expect
    .element(
      dialog.getByText("Revisá la clave: son ocho bloques de seis dígitos separados por guiones."),
    )
    .toBeVisible();
  expect(services.loadBitlockerRecoveryKey).not.toHaveBeenCalled();
});

test("cancelling reports it closed without saving", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.loadBitlockerRecoveryKey).not.toHaveBeenCalled();
});

test("opens the authorization modal on authorization_required, then authorizes and retries", async () => {
  const services = createServices();
  vi.mocked(services.loadBitlockerRecoveryKey).mockResolvedValueOnce({
    kind: "authorization_required",
  });
  vi.mocked(services.loadBitlockerRecoveryKey).mockResolvedValueOnce({ kind: "ok" });
  grantAuthorization(services);
  const onLoaded = vi.fn();
  const { screen, dialog } = await renderModal(services, { onLoaded });

  await typeAndSave(dialog, KEY, "1A2B3C4D");
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await expect
    .element(
      authDialog.getByText(
        "Cargar la clave de recuperación de BitLocker necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.loadBitlockerRecoveryKey).mock.calls.length).toBe(2);
  await expect.poll(() => onLoaded.mock.calls.length).toBe(1);
});

test("cancelling the authorization leaves the modal open and reports nothing loaded", async () => {
  const services = createServices();
  vi.mocked(services.loadBitlockerRecoveryKey).mockResolvedValue({
    kind: "authorization_required",
  });
  const onLoaded = vi.fn();
  const { screen, dialog } = await renderModal(services, { onLoaded });

  await typeAndSave(dialog, KEY, "1A2B3C4D");
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Autorizá este cambio" })
      .getByRole("button", { name: "Cancelar" }),
  );

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Autorizá este cambio" }).query())
    .toBeNull();
  await expect.element(dialog).toBeVisible();
  expect(onLoaded).not.toHaveBeenCalled();
});

test("explains that the register already has a key and reports the list outdated", async () => {
  const services = createServices();
  vi.mocked(services.loadBitlockerRecoveryKey).mockResolvedValue({ kind: "already_loaded" });
  const onOutdated = vi.fn();
  const { dialog } = await renderModal(services, { onOutdated });

  await typeAndSave(dialog, KEY, "1A2B3C4D");

  await expect.element(dialog.getByText("No se pudo guardar la clave")).toBeVisible();
  await expect
    .element(dialog.getByText("La caja ya tiene una clave de recuperación cargada."))
    .toBeVisible();
  expect(onOutdated).toHaveBeenCalledTimes(1);
});

test("explains that the register has no active installation and reports the list outdated", async () => {
  const services = createServices();
  vi.mocked(services.loadBitlockerRecoveryKey).mockResolvedValue({
    kind: "no_current_installation",
  });
  const onOutdated = vi.fn();
  const { dialog } = await renderModal(services, { onOutdated });

  await typeAndSave(dialog, KEY, "1A2B3C4D");

  await expect.element(dialog.getByText("No se pudo guardar la clave")).toBeVisible();
  await expect
    .element(dialog.getByText("La caja ya no tiene una instalación activa."))
    .toBeVisible();
  expect(onOutdated).toHaveBeenCalledTimes(1);
});

test("explains that the register no longer exists and reports the list outdated", async () => {
  const services = createServices();
  vi.mocked(services.loadBitlockerRecoveryKey).mockResolvedValue({ kind: "not_found" });
  const onOutdated = vi.fn();
  const { dialog } = await renderModal(services, { onOutdated });

  await typeAndSave(dialog, KEY, "1A2B3C4D");

  await expect.element(dialog.getByText("No se pudo guardar la clave")).toBeVisible();
  await expect.element(dialog.getByText("No se encontró la caja.")).toBeVisible();
  expect(onOutdated).toHaveBeenCalledTimes(1);
});

test("shows the rate-limited notice", async () => {
  const services = createServices();
  vi.mocked(services.loadBitlockerRecoveryKey).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const { dialog } = await renderModal(services);

  await typeAndSave(dialog, KEY, "1A2B3C4D");

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("shows the attempt-failed notice", async () => {
  const services = createServices();
  vi.mocked(services.loadBitlockerRecoveryKey).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal(services);

  await typeAndSave(dialog, KEY, "1A2B3C4D");

  await expect.element(dialog.getByText("No se pudo guardar la clave")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
});

test("ends the session when the save finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.loadBitlockerRecoveryKey).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await typeAndSave(dialog, KEY, "1A2B3C4D");

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
