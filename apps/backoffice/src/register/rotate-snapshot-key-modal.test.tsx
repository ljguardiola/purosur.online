import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  RotateSnapshotKeyModal,
  type RotateSnapshotKeyModalServices,
} from "./rotate-snapshot-key-modal";
import type { SnapshotBackupRegister } from "./snapshot-backups-api";
import {
  caja1,
  createAuthorizationServices,
  grantAuthorization,
} from "./test-support/snapshot-backups-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function createServices(
  overrides: Partial<RotateSnapshotKeyModalServices> = {},
): RotateSnapshotKeyModalServices {
  return {
    rotateSnapshotKey: vi.fn(),
    ...createAuthorizationServices(),
    ...overrides,
  };
}

type Handlers = {
  target?: SnapshotBackupRegister | null;
  onClose?: () => void;
  onRotated?: (keyVersion: number) => void;
  onRegisterNotFound?: () => void;
  onSessionEnded?: () => void;
};

function modalFor(services: RotateSnapshotKeyModalServices, handlers: Handlers = {}) {
  return (
    <main>
      <RotateSnapshotKeyModal
        target={handlers.target === undefined ? caja1 : handlers.target}
        onClose={handlers.onClose ?? (() => {})}
        onRotated={handlers.onRotated ?? (() => {})}
        onRegisterNotFound={handlers.onRegisterNotFound ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>
  );
}

async function renderModal(services: RotateSnapshotKeyModalServices, handlers: Handlers = {}) {
  const screen = await render(modalFor(services, handlers));
  const dialog = screen.getByRole("dialog", { name: "Rotar la clave de cifrado" });
  await expect.element(dialog).toBeVisible();
  return { screen, dialog };
}

type Dialog = Awaited<ReturnType<typeof renderModal>>["dialog"];

async function confirm(dialog: Dialog) {
  await userEvent.click(dialog.getByRole("button", { name: "Rotar la clave" }));
}

test("names the register and explains that only the backups made from now on use the new key", async () => {
  const { dialog } = await renderModal(createServices());

  await expect.element(dialog.getByText("Caja 1", { exact: true })).toBeVisible();
  expect(dialog.getByText(/Vas a rotar/).query()).toBeNull();
  await expect
    .element(dialog.getByText(/Solo los backups que se generen desde ahora usan la clave nueva/))
    .toBeVisible();
  await expect
    .element(dialog.getByText(/Los que ya existen se siguen pudiendo leer/))
    .toBeVisible();
});

test("has no accessibility violations", async () => {
  const { dialog } = await renderModal(createServices());

  await expectNoAccessibilityViolations(dialog.element());
});

test("is closed without a register to rotate", async () => {
  const screen = await render(modalFor(createServices(), { target: null }));

  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("rotates the register's key and reports the version now in use", async () => {
  const services = createServices();
  vi.mocked(services.rotateSnapshotKey).mockResolvedValue({ kind: "ok", value: { keyVersion: 3 } });
  const onRotated = vi.fn();
  const { dialog } = await renderModal(services, { onRotated });

  await confirm(dialog);

  await expect.poll(() => onRotated.mock.calls.length).toBe(1);
  expect(onRotated).toHaveBeenCalledWith(3);
  expect(services.rotateSnapshotKey).toHaveBeenCalledWith("register-1");
});

test("closing the modal reports it closed without rotating", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.rotateSnapshotKey).not.toHaveBeenCalled();
});

test("opens the authorization modal on authorization_required, then authorizes and retries", async () => {
  const services = createServices();
  vi.mocked(services.rotateSnapshotKey).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.rotateSnapshotKey).mockResolvedValueOnce({
    kind: "ok",
    value: { keyVersion: 2 },
  });
  const onRotated = vi.fn();
  const { screen, dialog } = await renderModal(services, { onRotated });

  await confirm(dialog);
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await expect
    .element(
      authDialog.getByText(
        "Rotar la clave de cifrado necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.rotateSnapshotKey).mock.calls.length).toBe(2);
  await expect.poll(() => onRotated.mock.calls.length).toBe(1);
});

test("cancelling the authorization leaves the modal open and reports nothing rotated", async () => {
  const services = createServices();
  vi.mocked(services.rotateSnapshotKey).mockResolvedValue({ kind: "authorization_required" });
  const onRotated = vi.fn();
  const { screen, dialog } = await renderModal(services, { onRotated });

  await confirm(dialog);
  await userEvent.click(
    screen.getByRole("dialog", { name: "Autorizá este cambio" }).getByRole("button", {
      name: "Cancelar",
    }),
  );

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Autorizá este cambio" }).query())
    .toBeNull();
  await expect.element(dialog).toBeVisible();
  expect(onRotated).not.toHaveBeenCalled();
});

test("reports a register the cloud no longer knows", async () => {
  const services = createServices();
  vi.mocked(services.rotateSnapshotKey).mockResolvedValue({ kind: "not_found" });
  const onRegisterNotFound = vi.fn();
  const { dialog } = await renderModal(services, { onRegisterNotFound });

  await confirm(dialog);

  await expect.poll(() => onRegisterNotFound.mock.calls.length).toBe(1);
});

test("explains that a register with no key yet has nothing to rotate", async () => {
  const services = createServices();
  vi.mocked(services.rotateSnapshotKey).mockResolvedValue({ kind: "no_key_yet" });
  const onRotated = vi.fn();
  const { dialog } = await renderModal(services, { onRotated });

  await confirm(dialog);

  await expect.element(dialog.getByText("Esta caja todavía no tiene una clave")).toBeVisible();
  await expect
    .element(dialog.getByText("La caja recibe su clave cuando se da de alta en una computadora."))
    .toBeVisible();
  expect(onRotated).not.toHaveBeenCalled();
});

test("shows the rate-limited notice", async () => {
  const services = createServices();
  vi.mocked(services.rotateSnapshotKey).mockResolvedValue({
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
  vi.mocked(services.rotateSnapshotKey).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal(services);

  await confirm(dialog);

  await expect.element(dialog.getByText("No se pudo rotar la clave")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
});

test("navigates to Mi cuenta when the rotation comes back forbidden", async () => {
  window.history.pushState(null, "", "/backups");
  const services = createServices();
  vi.mocked(services.rotateSnapshotKey).mockResolvedValue({ kind: "forbidden" });
  const { dialog } = await renderModal(services);

  await confirm(dialog);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the rotation finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.rotateSnapshotKey).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await confirm(dialog);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
