import { FieldSizeProvider } from "@purosur/ui";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { deferred } from "../payments/test-support/deferred";
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

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

function renderScreen(services: FiscalTasksScreenServices, onSessionEnded = () => {}) {
  return render(
    <FieldSizeProvider size="backoffice">
      <main>
        <FiscalTasksScreen services={services} onSessionEnded={onSessionEnded} />
      </main>
    </FieldSizeProvider>,
  );
}

async function loaded(services: FiscalTasksScreenServices, tasks = fiscalTasks) {
  vi.mocked(services.fetchFiscalTasks).mockResolvedValue({ kind: "ok", value: tasks });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Facturación externa")).toBeVisible();
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

test("heads the list by since when, task, register and alert, with no column to close a task", async () => {
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
  await expect.element(screen.getByText("Venta diferida vencida")).toBeVisible();

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
  await expect.element(screen.getByText("Todos los comprobantes están en orden.")).toBeVisible();
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
