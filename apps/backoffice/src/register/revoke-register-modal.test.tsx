import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { RegisterSummary, RevokeRegisterOutcome } from "./registers-api";
import type { RegistersListScreenServices } from "./registers-list-services";
import { RevokeRegisterModal } from "./revoke-register-modal";
import {
  createServices as createScreenServices,
  enrolledRegister,
  grantAuthorization,
} from "./test-support/registers-list-screen";

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const createServices = createScreenServices;

type Handlers = {
  target?: RegisterSummary | null;
  onClose?: () => void;
  onRevoked?: () => void;
  onOutdated?: () => void;
  onSessionEnded?: () => void;
};

function modalFor(services: RegistersListScreenServices, handlers: Handlers = {}) {
  return (
    <main>
      <RevokeRegisterModal
        target={handlers.target === undefined ? enrolledRegister : handlers.target}
        onClose={handlers.onClose ?? (() => {})}
        onRevoked={handlers.onRevoked ?? (() => {})}
        onOutdated={handlers.onOutdated ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>
  );
}

async function renderModal(services: RegistersListScreenServices, handlers: Handlers = {}) {
  const screen = await render(modalFor(services, handlers));
  const dialog = screen.getByRole("dialog", { name: "Revocar por pérdida o robo" });
  await expect.element(dialog).toBeVisible();
  return { screen, dialog };
}

type Dialog = Awaited<ReturnType<typeof renderModal>>["dialog"];

function ReopenableModal({
  services,
  handlers,
}: {
  services: RegistersListScreenServices;
  handlers: Omit<Handlers, "target" | "onClose">;
}) {
  const [target, setTarget] = useState<RegisterSummary | null>(enrolledRegister);
  return (
    <main>
      <button type="button" onClick={() => setTarget(enrolledRegister)}>
        Revocar Caja 3
      </button>
      <RevokeRegisterModal
        target={target}
        onClose={() => setTarget(null)}
        onRevoked={handlers.onRevoked ?? (() => {})}
        onOutdated={handlers.onOutdated ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>
  );
}

async function renderReopenableModal(
  services: RegistersListScreenServices,
  handlers: Omit<Handlers, "target" | "onClose"> = {},
) {
  const element = <ReopenableModal services={services} handlers={handlers} />;
  const screen = await render(element);
  // Rerendering drives React's async `act()`, which flushes the already-resolved answer's
  // continuation before returning.
  return Object.assign(screen, { settle: () => screen.rerender(element) });
}

type ReopenableScreen = Awaited<ReturnType<typeof renderReopenableModal>>;

function pendingRevocation(services: RegistersListScreenServices) {
  let resolveRevocation: (outcome: RevokeRegisterOutcome) => void = () => {};
  vi.mocked(services.revokeRegister).mockReturnValue(
    new Promise((resolve) => {
      resolveRevocation = resolve;
    }),
  );
  return (outcome: RevokeRegisterOutcome) => resolveRevocation(outcome);
}

async function closeModal(screen: ReopenableScreen) {
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Revocar por pérdida o robo" })
      .getByRole("button", { name: "Cerrar" }),
  );
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
}

async function reopenModal(screen: ReopenableScreen) {
  await userEvent.click(screen.getByRole("button", { name: "Revocar Caja 3" }));
  const dialog = screen.getByRole("dialog", { name: "Revocar por pérdida o robo" });
  await expect.element(dialog).toBeVisible();
  return dialog;
}

async function confirm(dialog: Dialog) {
  await userEvent.click(dialog.getByRole("button", { name: "Revocar la caja" }));
}

test("names the register and its machine, and explains what revoking does", async () => {
  const { dialog } = await renderModal(createServices());

  await expect.element(dialog.getByText("Caja 3 · CAJA-MOSTRADOR", { exact: true })).toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "La notebook deja de poder sincronizar en el momento. Se cambian las claves de sus backups y de sus tickets de respaldo, así que lo que tenga guardado no sirve para leer datos nuevos.",
      ),
    )
    .toBeVisible();
  await expect
    .element(
      dialog.getByText("Todas las personas de esta sucursal van a tener que elegir un PIN nuevo."),
    )
    .toBeVisible();
  await expect
    .element(
      dialog
        .getByText("Para volver a usar la caja hay que darla de alta de nuevo con un código.")
        .first(),
    )
    .toBeVisible();
});

test("has no accessibility violations", async () => {
  const { dialog } = await renderModal(createServices());

  await expectNoAccessibilityViolations(dialog.element());
});

test("is closed without a register to revoke", async () => {
  const screen = await render(modalFor(createServices(), { target: null }));

  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("revokes the register and reports it revoked", async () => {
  const services = createServices();
  vi.mocked(services.revokeRegister).mockResolvedValue({
    kind: "ok",
    value: { revokedAt: "2026-09-25T12:15:00.000Z" },
  });
  const onRevoked = vi.fn();
  const { dialog } = await renderModal(services, { onRevoked });

  await confirm(dialog);

  await expect.poll(() => onRevoked.mock.calls.length).toBe(1);
  expect(services.revokeRegister).toHaveBeenCalledWith("register-3");
});

test("closes itself once the revocation succeeds", async () => {
  const services = createServices();
  vi.mocked(services.revokeRegister).mockResolvedValue({
    kind: "ok",
    value: { revokedAt: "2026-09-25T12:15:00.000Z" },
  });
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });

  await confirm(dialog);

  await expect.poll(() => onClose.mock.calls.length).toBe(1);
});

test("cancelling reports it closed without revoking", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.revokeRegister).not.toHaveBeenCalled();
});

test("opens the authorization modal on authorization_required, then authorizes and retries", async () => {
  const services = createServices();
  vi.mocked(services.revokeRegister).mockResolvedValueOnce({ kind: "authorization_required" });
  vi.mocked(services.revokeRegister).mockResolvedValueOnce({
    kind: "ok",
    value: { revokedAt: "2026-09-25T12:15:00.000Z" },
  });
  grantAuthorization(services);
  const onRevoked = vi.fn();
  const { screen, dialog } = await renderModal(services, { onRevoked });

  await confirm(dialog);
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await expect
    .element(
      authDialog.getByText(
        "Revocar por pérdida o robo necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.revokeRegister).mock.calls.length).toBe(2);
  await expect.poll(() => onRevoked.mock.calls.length).toBe(1);
});

test("cancelling the authorization leaves the modal open and reports nothing revoked", async () => {
  const services = createServices();
  vi.mocked(services.revokeRegister).mockResolvedValue({ kind: "authorization_required" });
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

test("explains that a register without an active installation has nothing to revoke", async () => {
  const services = createServices();
  vi.mocked(services.revokeRegister).mockResolvedValue({ kind: "no_active_installation" });
  const onOutdated = vi.fn();
  const { dialog } = await renderModal(services, { onOutdated });

  await confirm(dialog);

  await expect.element(dialog.getByText("No se pudo revocar la caja")).toBeVisible();
  await expect
    .element(dialog.getByText("La caja ya no tiene una instalación activa."))
    .toBeVisible();
  expect(onOutdated).toHaveBeenCalledTimes(1);
});

test("explains that the register no longer exists", async () => {
  const services = createServices();
  vi.mocked(services.revokeRegister).mockResolvedValue({ kind: "not_found" });
  const onOutdated = vi.fn();
  const { dialog } = await renderModal(services, { onOutdated });

  await confirm(dialog);

  await expect.element(dialog.getByText("No se pudo revocar la caja")).toBeVisible();
  await expect.element(dialog.getByText("No se encontró la caja.")).toBeVisible();
  expect(onOutdated).toHaveBeenCalledTimes(1);
});

test("shows the rate-limited notice", async () => {
  const services = createServices();
  vi.mocked(services.revokeRegister).mockResolvedValue({
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
  vi.mocked(services.revokeRegister).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal(services);

  await confirm(dialog);

  await expect.element(dialog.getByText("No se pudo revocar la caja")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
});

test("ignores a failure that arrives after the modal was closed, once it opens again", async () => {
  const services = createServices();
  const resolveRevocation = pendingRevocation(services);
  const screen = await renderReopenableModal(services);
  await confirm(screen.getByRole("dialog", { name: "Revocar por pérdida o robo" }));
  await closeModal(screen);

  resolveRevocation({ kind: "failed" });
  await screen.settle();
  const dialog = await reopenModal(screen);

  expect(dialog.getByText("Probá de nuevo.").query()).toBeNull();
});

test("ignores a failure from an earlier opening that arrives after the modal opened again", async () => {
  const services = createServices();
  const resolveRevocation = pendingRevocation(services);
  const screen = await renderReopenableModal(services);
  await confirm(screen.getByRole("dialog", { name: "Revocar por pérdida o robo" }));
  await closeModal(screen);
  const dialog = await reopenModal(screen);

  resolveRevocation({ kind: "failed" });
  await screen.settle();

  expect(dialog.getByText("Probá de nuevo.").query()).toBeNull();
  await expect.element(dialog.getByRole("button", { name: "Revocar la caja" })).toBeEnabled();
});

test("leaves the modal open when a success from an earlier opening arrives after it opened again", async () => {
  const services = createServices();
  const resolveRevocation = pendingRevocation(services);
  const onRevoked = vi.fn();
  const screen = await renderReopenableModal(services, { onRevoked });
  await confirm(screen.getByRole("dialog", { name: "Revocar por pérdida o robo" }));
  await closeModal(screen);
  const dialog = await reopenModal(screen);

  resolveRevocation({ kind: "ok", value: { revokedAt: "2026-09-25T12:15:00.000Z" } });
  await screen.settle();

  await expect.poll(() => onRevoked.mock.calls.length).toBe(1);
  await expect.element(dialog).toBeVisible();
});

async function answerAfterClosing(
  outcome: RevokeRegisterOutcome,
  handlers: Omit<Handlers, "target" | "onClose">,
) {
  const services = createServices();
  const resolveRevocation = pendingRevocation(services);
  const screen = await renderReopenableModal(services, handlers);
  await confirm(screen.getByRole("dialog", { name: "Revocar por pérdida o robo" }));
  await closeModal(screen);

  resolveRevocation(outcome);
  await screen.settle();
}

test("reports the register revoked when the success arrives after the modal was closed", async () => {
  const onRevoked = vi.fn();

  await answerAfterClosing({ kind: "ok" }, { onRevoked });

  await expect.poll(() => onRevoked.mock.calls.length).toBe(1);
});

test("ends the session when no open session is found after the modal was closed", async () => {
  const onSessionEnded = vi.fn();

  await answerAfterClosing({ kind: "unauthenticated" }, { onSessionEnded });

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("reports the list outdated when the register is not found after the modal was closed", async () => {
  const onOutdated = vi.fn();

  await answerAfterClosing({ kind: "not_found" }, { onOutdated });

  await expect.poll(() => onOutdated.mock.calls.length).toBe(1);
});

test("reports the list outdated when no active installation is found after the modal was closed", async () => {
  const onOutdated = vi.fn();

  await answerAfterClosing({ kind: "no_active_installation" }, { onOutdated });

  await expect.poll(() => onOutdated.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the revocation comes back forbidden after the modal was closed", async () => {
  window.history.pushState(null, "", "/registers");

  await answerAfterClosing({ kind: "forbidden" }, {});

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("navigates to Mi cuenta when the revocation comes back forbidden", async () => {
  window.history.pushState(null, "", "/registers");
  const services = createServices();
  vi.mocked(services.revokeRegister).mockResolvedValue({ kind: "forbidden" });
  const { dialog } = await renderModal(services);

  await confirm(dialog);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the revocation finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.revokeRegister).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await confirm(dialog);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});
