import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { RevokeEveryInstallationOutcome } from "./registers-api";
import type { RegistersListScreenServices } from "./registers-list-services";
import { RevokeEveryInstallationModal } from "./revoke-every-installation-modal";
import { createServices, grantAuthorization } from "./test-support/registers-list-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const revoked: RevokeEveryInstallationOutcome = {
  kind: "ok",
  value: { revokedAt: "2026-09-25T12:15:00.000Z", revokedRegisters: 3 },
};

type Handlers = {
  open?: boolean;
  onClose?: () => void;
  onRevoked?: (revocation: { revokedRegisters: number }) => void;
  onSessionEnded?: () => void;
};

function modalFor(services: RegistersListScreenServices, handlers: Handlers = {}) {
  return (
    <main>
      <RevokeEveryInstallationModal
        open={handlers.open ?? true}
        onClose={handlers.onClose ?? (() => {})}
        onRevoked={handlers.onRevoked ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>
  );
}

async function renderModal(services: RegistersListScreenServices, handlers: Handlers = {}) {
  const screen = await render(modalFor(services, handlers));
  const dialog = screen.getByRole("dialog", { name: "Revocar todas las instalaciones" });
  await expect.element(dialog).toBeVisible();
  return { screen, dialog };
}

type Dialog = Awaited<ReturnType<typeof renderModal>>["dialog"];

function ClosableModal({
  services,
  onRevoked,
}: {
  services: RegistersListScreenServices;
  onRevoked: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <main>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <RevokeEveryInstallationModal
        open={open}
        onClose={() => setOpen(false)}
        onRevoked={onRevoked}
        onSessionEnded={() => {}}
        services={services}
      />
    </main>
  );
}

async function confirm(dialog: Dialog) {
  await userEvent.click(dialog.getByRole("button", { name: "Revocar todas" }));
}

test("says it reaches every branch and explains what revoking does", async () => {
  const { dialog } = await renderModal(createServices());

  await expect.element(dialog.getByText("Todas las sucursales", { exact: true })).toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "Todas las cajas de todas las sucursales dejan de poder sincronizar en el momento. Se cambian las claves de sus backups y de sus tickets de respaldo, así que lo que tengan guardado no sirve para leer datos nuevos.",
      ),
    )
    .toBeVisible();
  await expect
    .element(
      dialog
        .getByText("Para volver a usar cada caja hay que darla de alta de nuevo con un código.")
        .first(),
    )
    .toBeVisible();
});

test("has no accessibility violations", async () => {
  const { dialog } = await renderModal(createServices());

  await expectNoAccessibilityViolations(dialog.element());
});

test("is closed when it is not open", async () => {
  const screen = await render(modalFor(createServices(), { open: false }));

  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("revokes every installation, reports how many registers were revoked and closes itself", async () => {
  const services = createServices();
  vi.mocked(services.revokeEveryInstallation).mockResolvedValue(revoked);
  const onRevoked = vi.fn();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onRevoked, onClose });

  await confirm(dialog);

  await expect.poll(() => onRevoked.mock.calls.length).toBe(1);
  expect(onRevoked).toHaveBeenCalledWith({ revokedRegisters: 3 });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.revokeEveryInstallation).toHaveBeenCalledTimes(1);
});

test("cancelling reports it closed without revoking", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.revokeEveryInstallation).not.toHaveBeenCalled();
});

test("without a fresh authorization it asks for the passkey, then revokes once it is given", async () => {
  const services = createServices();
  vi.mocked(services.revokeEveryInstallation).mockResolvedValueOnce({
    kind: "authorization_required",
  });
  vi.mocked(services.revokeEveryInstallation).mockResolvedValueOnce(revoked);
  grantAuthorization(services);
  const onRevoked = vi.fn();
  const { screen, dialog } = await renderModal(services, { onRevoked });

  await confirm(dialog);
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await expect
    .element(
      authDialog.getByText(
        "Revocar todas las instalaciones necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();
  expect(onRevoked).not.toHaveBeenCalled();
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => onRevoked.mock.calls.length).toBe(1);
  expect(services.revokeEveryInstallation).toHaveBeenCalledTimes(2);
});

test("cancelling the authorization leaves the modal open and revokes nothing", async () => {
  const services = createServices();
  vi.mocked(services.revokeEveryInstallation).mockResolvedValue({ kind: "authorization_required" });
  const onRevoked = vi.fn();
  const { screen, dialog } = await renderModal(services, { onRevoked });

  await confirm(dialog);
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Autorizá este cambio" })
      .getByRole("button", { name: "Cancelar" }),
  );

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Autorizá este cambio" }).query())
    .toBeNull();
  await expect.element(dialog).toBeVisible();
  expect(onRevoked).not.toHaveBeenCalled();
});

test("explains that no register has an installation in service to revoke", async () => {
  const services = createServices();
  vi.mocked(services.revokeEveryInstallation).mockResolvedValue({
    kind: "no_active_installation",
  });
  const { dialog } = await renderModal(services);

  await confirm(dialog);

  await expect
    .element(dialog.getByText("Ninguna caja tiene una instalación vigente para revocar."))
    .toBeVisible();
});

test("shows the rate-limited notice", async () => {
  const services = createServices();
  vi.mocked(services.revokeEveryInstallation).mockResolvedValue({
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
  vi.mocked(services.revokeEveryInstallation).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal(services);

  await confirm(dialog);

  await expect.element(dialog.getByText("No se pudieron revocar las instalaciones")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
});

test("navigates to Mi cuenta when the revocation comes back forbidden", async () => {
  window.history.pushState(null, "", "/registers");
  const services = createServices();
  vi.mocked(services.revokeEveryInstallation).mockResolvedValue({ kind: "forbidden" });
  const { dialog } = await renderModal(services);

  await confirm(dialog);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the revocation finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.revokeEveryInstallation).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await confirm(dialog);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("reports the registers revoked when the success arrives after the modal was closed", async () => {
  const services = createServices();
  let answer: (outcome: RevokeEveryInstallationOutcome) => void = () => {};
  vi.mocked(services.revokeEveryInstallation).mockReturnValue(
    new Promise((resolve) => {
      answer = resolve;
    }),
  );
  const onRevoked = vi.fn();
  const element = <ClosableModal services={services} onRevoked={onRevoked} />;
  const screen = await render(element);
  const dialog = screen.getByRole("dialog", { name: "Revocar todas las instalaciones" });
  await confirm(dialog);
  await userEvent.click(dialog.getByRole("button", { name: "Cerrar" }));
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();

  answer(revoked);
  await screen.rerender(element);

  await expect.poll(() => onRevoked.mock.calls.length).toBe(1);
});
