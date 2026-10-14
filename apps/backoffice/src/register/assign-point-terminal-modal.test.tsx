import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { type Locator, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import {
  AssignPointTerminalModal,
  type AssignPointTerminalModalServices,
} from "./assign-point-terminal-modal";
import type { RegisterReload } from "./register-queries";
import type { RegisterSummary } from "./registers-api";

function createServices(
  overrides: Partial<AssignPointTerminalModalServices> = {},
): AssignPointTerminalModalServices {
  return {
    assignPointTerminal: vi.fn(),
    ...overrides,
  };
}

const assigned: RegisterSummary = {
  id: "register-1",
  name: "Caja 1",
  pendingCode: null,
  pointOfSaleNumber: null,
  pointTerminalId: "TERM-0042",
  pointTerminalVersion: 2,
  installation: null,
};

const unassigned: RegisterSummary = { ...assigned, pointTerminalId: null, pointTerminalVersion: 0 };

type ModalOptions = {
  target?: RegisterSummary | null;
  services?: AssignPointTerminalModalServices;
  onClose?: () => void;
  onSaved?: () => void;
  reload?: (id: string) => Promise<RegisterReload>;
  onSessionEnded?: () => void;
};

function found(register: RegisterSummary) {
  return Promise.resolve({ kind: "found", register } as const);
}

function modalElement({
  target = assigned,
  services = createServices(),
  onClose = () => {},
  onSaved = () => {},
  reload = () => found(assigned),
  onSessionEnded = () => {},
}: ModalOptions) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <AssignPointTerminalModal
          target={target}
          services={services}
          onClose={onClose}
          onSaved={onSaved}
          reload={reload}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

async function renderModal(options: ModalOptions = {}) {
  const screen = await render(modalElement(options));
  return { screen, dialog: screen.getByRole("dialog", { name: "Terminal Point integrada" }) };
}

function save(dialog: Locator) {
  return userEvent.click(dialog.getByRole("button", { name: "Guardar" }));
}

function terminalField(dialog: Locator) {
  return dialog.getByRole("textbox", { name: /^Identificador de la terminal/ });
}

test("names the register in the eyebrow and prefills the current terminal", async () => {
  const { dialog } = await renderModal();

  await expect.element(dialog.getByText("Caja 1").first()).toBeVisible();
  await expect.element(terminalField(dialog)).toHaveValue("TERM-0042");
  await expectNoAccessibilityViolations(document.body);
});

test("saves the typed terminal with the version it was loaded with and reports it saved", async () => {
  const services = createServices();
  vi.mocked(services.assignPointTerminal).mockResolvedValue({ kind: "ok" });
  const onSaved = vi.fn();
  const { dialog } = await renderModal({ services, onSaved });

  await userEvent.fill(terminalField(dialog), " TERM-0099 ");
  await save(dialog);

  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
  expect(services.assignPointTerminal).toHaveBeenCalledWith("register-1", {
    terminal_id: "TERM-0099",
    version: 2,
  });
});

test("offers no removal for a register without a terminal", async () => {
  const { dialog } = await renderModal({ target: unassigned });

  await expect.element(terminalField(dialog)).toHaveValue("");
  expect(dialog.getByRole("button", { name: "Quitar terminal" }).query()).toBeNull();
});

test("removes the terminal by sending null with the loaded version", async () => {
  const services = createServices();
  vi.mocked(services.assignPointTerminal).mockResolvedValue({ kind: "ok" });
  const onSaved = vi.fn();
  const { dialog } = await renderModal({ services, onSaved });

  await userEvent.click(dialog.getByRole("button", { name: "Quitar terminal" }));

  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
  expect(services.assignPointTerminal).toHaveBeenCalledWith("register-1", {
    terminal_id: null,
    version: 2,
  });
});

test("requires a terminal before saving, without calling the cloud", async () => {
  const services = createServices();
  const { dialog } = await renderModal({ target: unassigned, services });

  await save(dialog);

  await expect.element(dialog.getByText("Ingresá el identificador de la terminal.")).toBeVisible();
  expect(services.assignPointTerminal).not.toHaveBeenCalled();
});

test("Cancelar asks to close without calling the cloud", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal({ services, onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.assignPointTerminal).not.toHaveBeenCalled();
});

test("shows on the field that the terminal belongs to another register", async () => {
  const services = createServices();
  vi.mocked(services.assignPointTerminal).mockResolvedValue({ kind: "point_terminal_taken" });
  const onSaved = vi.fn();
  const { dialog } = await renderModal({ services, onSaved });

  await save(dialog);

  await expect.element(dialog.getByText("Esa terminal ya está asignada a otra caja")).toBeVisible();
  expect(onSaved).not.toHaveBeenCalled();
});

test("shows the message of the field the cloud refused", async () => {
  const services = createServices();
  vi.mocked(services.assignPointTerminal).mockResolvedValue({
    kind: "validation_failed",
    field: "terminal_id",
  });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect
    .element(dialog.getByText("El identificador de la terminal no puede tener espacios."))
    .toBeVisible();
});

test("shows the attempt-failed notice when the save fails", async () => {
  const services = createServices();
  vi.mocked(services.assignPointTerminal).mockResolvedValue({ kind: "failed" });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect.element(dialog.getByText("No se pudo guardar la terminal")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
});

test("shows the attempt-failed notice when the removal fails", async () => {
  const services = createServices();
  vi.mocked(services.assignPointTerminal).mockResolvedValue({ kind: "point_terminal_taken" });
  const { dialog } = await renderModal({ services });

  await userEvent.click(dialog.getByRole("button", { name: "Quitar terminal" }));

  await expect.element(dialog.getByText("No se pudo guardar la terminal")).toBeVisible();
});

test("shows the rate-limit notice with the wait", async () => {
  const services = createServices();
  vi.mocked(services.assignPointTerminal).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("ends the session when the save finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.assignPointTerminal).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal({ services, onSessionEnded });

  await save(dialog);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the save comes back forbidden", async () => {
  window.history.pushState(null, "", "/registers");
  const services = createServices();
  vi.mocked(services.assignPointTerminal).mockResolvedValue({ kind: "forbidden" });
  const { dialog } = await renderModal({ services });

  await save(dialog);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("reads the register again when the save finds it missing, and says it no longer exists when it is gone", async () => {
  const services = createServices();
  vi.mocked(services.assignPointTerminal).mockResolvedValue({ kind: "not_found" });
  const reload = vi.fn(() => Promise.resolve({ kind: "not_found" } as const));
  const { dialog } = await renderModal({ services, reload });

  await save(dialog);

  await expect.element(dialog.getByText("La caja ya no existe")).toBeVisible();
  expect(reload).toHaveBeenCalledWith("register-1");
  await expect.element(dialog.getByRole("button", { name: "Guardar" })).toBeDisabled();
  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeEnabled();
});

test("offers to reload when the register could not be read again after the save found it missing", async () => {
  const services = createServices();
  vi.mocked(services.assignPointTerminal).mockResolvedValue({ kind: "not_found" });
  const reload = vi.fn(() => Promise.resolve({ kind: "failed" } as const));
  const { dialog } = await renderModal({ services, reload });

  await save(dialog);

  await expect.element(dialog.getByText("No se pudieron recargar los datos")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Recargar" })).toBeVisible();
});

test("ends the session when reading the register again finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.assignPointTerminal).mockResolvedValue({ kind: "not_found" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal({
    services,
    onSessionEnded,
    reload: () => Promise.resolve({ kind: "unauthenticated" } as const),
  });

  await save(dialog);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("shows a stale-version notice, and Recargar reads the register again so the second save sends the new version", async () => {
  const services = createServices();
  vi.mocked(services.assignPointTerminal).mockResolvedValueOnce({ kind: "stale_version" });
  const changed: RegisterSummary = {
    ...assigned,
    pointTerminalId: "TERM-0077",
    pointTerminalVersion: 5,
  };
  const { dialog } = await renderModal({ services, reload: () => found(changed) });
  await save(dialog);
  await expect
    .element(dialog.getByText("La terminal de la caja cambió mientras la editabas"))
    .toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.element(terminalField(dialog)).toHaveValue("TERM-0077");
  vi.mocked(services.assignPointTerminal).mockResolvedValueOnce({ kind: "ok" });
  await userEvent.click(dialog.getByRole("button", { name: "Guardar" }));
  await expect.poll(() => vi.mocked(services.assignPointTerminal).mock.calls.length).toBe(2);
  expect(services.assignPointTerminal).toHaveBeenLastCalledWith("register-1", {
    terminal_id: "TERM-0077",
    version: 5,
  });
});

test("removing after a reload sends the reloaded version", async () => {
  const services = createServices();
  vi.mocked(services.assignPointTerminal).mockResolvedValueOnce({ kind: "stale_version" });
  const changed: RegisterSummary = {
    ...assigned,
    pointTerminalId: "TERM-0077",
    pointTerminalVersion: 5,
  };
  const { dialog } = await renderModal({ services, reload: () => found(changed) });
  await save(dialog);
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));
  await expect.element(terminalField(dialog)).toHaveValue("TERM-0077");
  vi.mocked(services.assignPointTerminal).mockResolvedValueOnce({ kind: "ok" });

  await userEvent.click(dialog.getByRole("button", { name: "Quitar terminal" }));

  await expect.poll(() => vi.mocked(services.assignPointTerminal).mock.calls.length).toBe(2);
  expect(services.assignPointTerminal).toHaveBeenLastCalledWith("register-1", {
    terminal_id: null,
    version: 5,
  });
});
