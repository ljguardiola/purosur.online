import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, onTestFinished, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { deferred } from "../platform/test-support/deferred";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { accessWith, NO_CAPABILITIES_ACCESS } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { FiscalTasksScreen } from "./fiscal-tasks-screen";
import type { FiscalTasksScreenServices } from "./fiscal-tasks-services";
import {
  creditNoteRejectedTask,
  deferredSaleExpiredTask,
  externalInvoicingTask,
  fiscalTasks,
  noFiscalTasks,
} from "./test-support/fiscal-task-fixtures";
import { createFiscalTasksServices } from "./test-support/fiscal-tasks-screen-services";

beforeEach(async () => {
  window.history.pushState(null, "", "/");
  await page.viewport(1280, 800);
  onTestFinished(() => page.viewport(414, 896));
});

function renderScreen(
  services: FiscalTasksScreenServices,
  onSessionEnded = () => {},
  access: BackofficeAccess = NO_CAPABILITIES_ACCESS,
) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <FiscalTasksScreen access={access} services={services} onSessionEnded={onSessionEnded} />
      </main>
    </FieldSizeProvider>,
  );
}

async function loaded(
  services: FiscalTasksScreenServices,
  tasks = fiscalTasks,
  access: BackofficeAccess = NO_CAPABILITIES_ACCESS,
) {
  vi.mocked(services.fetchFiscalTasks).mockResolvedValue({ kind: "ok", value: tasks });
  const screen = await renderScreen(services, () => {}, access);
  await expect.element(screen.getByText(/tareas? abiertas?$/)).toBeVisible();
  return screen;
}

function rowTexts(screen: Awaited<ReturnType<typeof renderScreen>>) {
  return screen
    .getByRole("row")
    .all()
    .slice(1)
    .map((row) => row.element().textContent ?? "");
}

test("shows the eyebrow, the heading and each open task with since when, what, where and its alert", async () => {
  const screen = await loaded(createFiscalTasksServices());

  await expect.element(screen.getByText("Caja y fiscal · Tareas")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Tareas fiscales", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByRole("table", { name: "Tareas fiscales" })).toBeVisible();
  const [external, rejected, expired] = rowTexts(screen);
  expect(external).toContain("13/09/2026");
  expect(external).toContain("hace 3 días");
  expect(external).toContain("Facturación externa");
  expect(external).toContain("Comprobante 00004-00001234 autorizado por ARCA fuera del sistema");
  expect(external).toContain("Caja del frente");
  expect(external).toContain("Crítica");
  expect(external).toContain("Escaló el 14/09/2026 · 12:30");
  expect(rejected).toContain("hace 1 hora");
  expect(rejected).toContain("Nota de crédito rechazada");
  expect(rejected).toContain("ARCA rechazó la nota de crédito 00004-00000017");
  expect(rejected).toContain("Advertencia");
  expect(rejected).not.toContain("Escaló");
  expect(expired).toContain("Venta diferida vencida");
  expect(expired).toContain("Venta del 06/09/2026 por $ 18.200,00 que no llegó a facturarse");
  expect(expired).toContain("Caja del fondo");
  expect(expired).toContain("Sin aviso");
  expect(expired).toContain("Pasó a regularización manual");
  await expectNoAccessibilityViolations(screen.container);
});

test("without the capability to close tasks, heads the list by since when, task, register and alert and offers no button", async () => {
  const screen = await loaded(createFiscalTasksServices());

  const headers = screen
    .getByRole("columnheader")
    .all()
    .map((header) => header.element().textContent?.trim());
  expect(headers).toEqual(["Abierta", "Tarea", "Caja", "Aviso"]);
  expect(screen.getByRole("button").query()).toBeNull();
});

test("a task whose alert is not shown never says it escalated or went manual unless it is a deferred sale", async () => {
  const task = { ...externalInvoicingTask, alert: null };
  const screen = await loaded(createFiscalTasksServices(), { tasks: [task] });

  const [row] = rowTexts(screen);
  expect(row).toContain("Sin aviso");
  expect(row).not.toContain("Pasó a regularización manual");
});

test("counts the open tasks under the table", async () => {
  const screen = await loaded(createFiscalTasksServices());

  await expect.element(screen.getByText("3 tareas abiertas")).toBeVisible();
});

test("counts a single open task in the singular", async () => {
  const screen = await loaded(createFiscalTasksServices(), { tasks: [deferredSaleExpiredTask] });

  await expect.element(screen.getByText("1 tarea abierta")).toBeVisible();
});

test("keeps the order the cloud sent the tasks in", async () => {
  const screen = await loaded(createFiscalTasksServices(), {
    tasks: [deferredSaleExpiredTask, creditNoteRejectedTask],
  });

  const [first, second] = rowTexts(screen);
  expect(first).toContain("Venta diferida vencida");
  expect(second).toContain("Nota de crédito rechazada");
});

test("shows the empty state when no fiscal task is open", async () => {
  const services = createFiscalTasksServices();
  vi.mocked(services.fetchFiscalTasks).mockResolvedValue({ kind: "ok", value: noFiscalTasks });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Sin tareas fiscales abiertas")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Aparecen acá cuando hay que resolver a mano un comprobante o una venta diferida vencida.",
      ),
    )
    .toBeVisible();
  expect(screen.getByText("Todos los comprobantes están en orden.").query()).toBeNull();
  expect(screen.getByText("0 tareas abiertas").query()).toBeNull();
});

test("shows the table loading while the tasks load", async () => {
  const services = createFiscalTasksServices();
  const firstLoad = deferred<Awaited<ReturnType<typeof services.fetchFiscalTasks>>>();
  vi.mocked(services.fetchFiscalTasks).mockReturnValueOnce(firstLoad.promise);

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Tareas fiscales" }))
    .toHaveAttribute("aria-busy", "true");
});

test("shows a load error with a retry action that starts again from the loading placeholder", async () => {
  const services = createFiscalTasksServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchFiscalTasks>>>();
  vi.mocked(services.fetchFiscalTasks)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir las tareas fiscales")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("table", { name: "Tareas fiscales" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: fiscalTasks });
  await expect.element(screen.getByText("Facturación externa")).toBeVisible();
});

test("navigates to Mi cuenta when the tasks request comes back forbidden", async () => {
  window.history.pushState(null, "", "/fiscal-tasks");
  const services = createFiscalTasksServices();
  vi.mocked(services.fetchFiscalTasks).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the tasks request finds no open session", async () => {
  const services = createFiscalTasksServices();
  vi.mocked(services.fetchFiscalTasks).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

const closeAccess = accessWith("close_fiscal_tasks");

test("heads one more column and offers a Cerrar tarea button on each row to who may close tasks", async () => {
  const screen = await loaded(createFiscalTasksServices(), fiscalTasks, closeAccess);

  const headers = screen
    .getByRole("columnheader")
    .all()
    .map((header) => header.element().textContent?.trim());
  expect(headers).toEqual(["Abierta", "Tarea", "Caja", "Aviso", "Acciones"]);
  expect(screen.getByRole("button", { name: "Cerrar tarea" }).all()).toHaveLength(3);
  await expectNoAccessibilityViolations(screen.container);
});

test("opens the closing modal for the task of the row", async () => {
  const screen = await loaded(createFiscalTasksServices(), fiscalTasks, closeAccess);

  await userEvent.click(screen.getByRole("button", { name: "Cerrar tarea" }).nth(1));

  const dialog = screen.getByRole("dialog", { name: "Cerrar tarea fiscal" });
  await expect.element(dialog).toBeVisible();
  await expect
    .element(dialog.getByText("ARCA rechazó la nota de crédito 00004-00000017"))
    .toBeVisible();
});

test("closes the modal without closing anything on Cancelar", async () => {
  const services = createFiscalTasksServices();
  const screen = await loaded(services, fiscalTasks, closeAccess);
  await userEvent.click(screen.getByRole("button", { name: "Cerrar tarea" }).first());

  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  expect(services.closeFiscalTask).not.toHaveBeenCalled();
});

test("after closing a task, reads the tasks again and the task leaves the list", async () => {
  const services = createFiscalTasksServices();
  vi.mocked(services.closeFiscalTask).mockResolvedValue({ kind: "ok" });
  const screen = await loaded(services, fiscalTasks, closeAccess);
  vi.mocked(services.fetchFiscalTasks).mockResolvedValue({
    kind: "ok",
    value: { tasks: [creditNoteRejectedTask, deferredSaleExpiredTask] },
  });
  await userEvent.click(screen.getByRole("button", { name: "Cerrar tarea" }).first());

  await userEvent.fill(
    screen.getByRole("textbox", { name: /^Cómo se regularizó/ }),
    "Regularizada con el contador",
  );
  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cerrar tarea" }));

  await expect.element(screen.getByText("2 tareas abiertas")).toBeVisible();
  expect(services.closeFiscalTask).toHaveBeenCalledWith(externalInvoicingTask.id, {
    note: "Regularizada con el contador",
  });
  expect(screen.getByText("Facturación externa").query()).toBeNull();
  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
});

test("after the cloud says the task was already closed, reads the tasks again and keeps the modal with the notice", async () => {
  const services = createFiscalTasksServices();
  vi.mocked(services.closeFiscalTask).mockResolvedValue({ kind: "already_closed" });
  const screen = await loaded(services, fiscalTasks, closeAccess);
  vi.mocked(services.fetchFiscalTasks).mockResolvedValue({
    kind: "ok",
    value: { tasks: [creditNoteRejectedTask, deferredSaleExpiredTask] },
  });
  await userEvent.click(screen.getByRole("button", { name: "Cerrar tarea" }).first());

  await userEvent.fill(screen.getByRole("textbox", { name: /^Cómo se regularizó/ }), "Listo");
  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Cerrar tarea" }));

  await expect.element(screen.getByText("2 tareas abiertas")).toBeVisible();
  await expect
    .element(screen.getByRole("dialog").getByText("Esta tarea ya estaba cerrada.").first())
    .toBeVisible();
});
