import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { type Locator, userEvent } from "vitest/browser";
import { deferred } from "../payments/test-support/deferred";
import { render } from "../shell/test-support/render-with-router";
import {
  CloseFiscalTaskModal,
  type CloseFiscalTaskModalServices,
} from "./close-fiscal-task-modal";
import type { CloseFiscalTaskOutcome } from "./fiscal-tasks-api";
import { externalInvoicingTask } from "./test-support/fiscal-task-fixtures";

function createServices(): CloseFiscalTaskModalServices {
  return { closeFiscalTask: vi.fn() };
}

type Handlers = {
  onClose?: () => void;
  onClosed?: () => void;
  reload?: () => Promise<unknown>;
  onSessionEnded?: () => void;
};

async function renderModal(services: CloseFiscalTaskModalServices, handlers: Handlers = {}) {
  const screen = await render(
    <FieldSizeProvider size="backoffice">
      <main>
        <CloseFiscalTaskModal
          target={externalInvoicingTask}
          onClose={handlers.onClose ?? (() => {})}
          onClosed={handlers.onClosed ?? (() => {})}
          reload={handlers.reload ?? (() => Promise.resolve())}
          onSessionEnded={handlers.onSessionEnded ?? (() => {})}
          services={services}
        />
      </main>
    </FieldSizeProvider>,
  );
  const dialog = screen.getByRole("dialog", { name: "Cerrar tarea fiscal" });
  await expect.element(dialog).toBeVisible();
  return { screen, dialog };
}

async function closeWith(dialog: Locator, note: string) {
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Cómo se regularizó/ }), note);
  await userEvent.click(dialog.getByRole("button", { name: "Cerrar tarea" }));
}

test("names the task and opens with an empty note to fill", async () => {
  const { dialog } = await renderModal(createServices());

  await expect.element(dialog.getByText("Facturación externa")).toBeVisible();
  await expect
    .element(
      dialog.getByText("Comprobante 00004-00001234 autorizado por ARCA fuera del sistema"),
    )
    .toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Cómo se regularizó/ }))
    .toHaveValue("");
  await expectNoAccessibilityViolations(document.body);
});

test("Cancelar asks to close without calling the cloud", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const { dialog } = await renderModal(services, { onClose });

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.closeFiscalTask).not.toHaveBeenCalled();
});

test("shows the field error and sends nothing when the note is blank", async () => {
  const services = createServices();
  const { dialog } = await renderModal(services);

  await closeWith(dialog, "   ");

  await expect.element(dialog.getByText("Contá cómo se regularizó la tarea.")).toBeVisible();
  expect(services.closeFiscalTask).not.toHaveBeenCalled();
});

test("sends the trimmed note for the task, then reloads the list and reports it closed", async () => {
  const services = createServices();
  vi.mocked(services.closeFiscalTask).mockResolvedValue({ kind: "ok" });
  const reload = vi.fn().mockResolvedValue(undefined);
  const onClosed = vi.fn();
  const { dialog } = await renderModal(services, { reload, onClosed });

  await closeWith(dialog, "  Regularizada con el contador ");

  await expect.poll(() => onClosed.mock.calls.length).toBe(1);
  expect(services.closeFiscalTask).toHaveBeenCalledWith(externalInvoicingTask.id, {
    note: "Regularizada con el contador",
  });
  expect(reload).toHaveBeenCalledTimes(1);
});

test("blocks the buttons while the task is being closed", async () => {
  const services = createServices();
  const sending = deferred<CloseFiscalTaskOutcome>();
  vi.mocked(services.closeFiscalTask).mockReturnValue(sending.promise);
  const { dialog } = await renderModal(services);

  await closeWith(dialog, "Listo");

  await expect.element(dialog.getByRole("button", { name: "Cerrar tarea" })).toBeDisabled();
  await expect.element(dialog.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  sending.resolve({ kind: "ok" });
});

test("says the task was already closed, reloads the list and offers no second attempt", async () => {
  const services = createServices();
  vi.mocked(services.closeFiscalTask).mockResolvedValue({ kind: "already_closed" });
  const reload = vi.fn().mockResolvedValue(undefined);
  const onClosed = vi.fn();
  const { dialog } = await renderModal(services, { reload, onClosed });

  await closeWith(dialog, "Listo");

  await expect.element(dialog.getByText("Esta tarea ya estaba cerrada.").first()).toBeVisible();
  expect(reload).toHaveBeenCalledTimes(1);
  expect(onClosed).not.toHaveBeenCalled();
  await expect.element(dialog.getByRole("button", { name: "Cerrar tarea" })).toBeDisabled();
});

test("says the task is no longer there and reloads the list", async () => {
  const services = createServices();
  vi.mocked(services.closeFiscalTask).mockResolvedValue({ kind: "not_found" });
  const reload = vi.fn().mockResolvedValue(undefined);
  const { dialog } = await renderModal(services, { reload });

  await closeWith(dialog, "Listo");

  await expect.element(dialog.getByText("Esta tarea ya no está disponible.").first()).toBeVisible();
  expect(reload).toHaveBeenCalledTimes(1);
  await expect.element(dialog.getByRole("button", { name: "Cerrar tarea" })).toBeDisabled();
});

test("keeps the note and says it failed when the cloud cannot close the task", async () => {
  const services = createServices();
  vi.mocked(services.closeFiscalTask).mockResolvedValue({ kind: "failed" });
  const onClosed = vi.fn();
  const { dialog } = await renderModal(services, { onClosed });

  await closeWith(dialog, "Listo");

  await expect.element(dialog.getByText("No se pudo cerrar la tarea")).toBeVisible();
  await expect.element(dialog.getByText("Probá de nuevo.")).toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Cómo se regularizó/ }))
    .toHaveValue("Listo");
  await expect.element(dialog.getByRole("button", { name: "Cerrar tarea" })).toBeEnabled();
  expect(onClosed).not.toHaveBeenCalled();
});

test("says how long to wait when the cloud rate limits the request", async () => {
  const services = createServices();
  vi.mocked(services.closeFiscalTask).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 30,
  });
  const { dialog } = await renderModal(services);

  await closeWith(dialog, "Listo");

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("ends the session when the cloud finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.closeFiscalTask).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const { dialog } = await renderModal(services, { onSessionEnded });

  await closeWith(dialog, "Listo");

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("sends the person to Mi cuenta when the cloud refuses the capability", async () => {
  window.history.pushState(null, "", "/fiscal-tasks");
  const services = createServices();
  vi.mocked(services.closeFiscalTask).mockResolvedValue({ kind: "forbidden" });
  const { dialog } = await renderModal(services);

  await closeWith(dialog, "Listo");

  await expect.poll(() => window.location.pathname).toBe("/account");
});
