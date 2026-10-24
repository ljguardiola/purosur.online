import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { fiscalTasks } from "../fiscal/test-support/fiscal-task-fixtures";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens([
  "/",
  "/account",
  "/help",
  "/fiscal-tasks",
  "/refunds/mercado-pago",
  "/points-of-sale",
]);

beforeEach(resetPageState);

function servicesFor(capabilities: Capability[]) {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Lucía Ferreyra",
        isAdministrator: false,
        capabilities,
      }),
    ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.fiscalTasksScreen.fetchFiscalTasks).mockResolvedValue({
    kind: "ok",
    value: fiscalTasks,
  });
  return services;
}

test("opens the fiscal tasks from the rail's Caja item for a user who only sees fiscal information", async () => {
  const services = servicesFor(["fiscal_information"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Caja" }));

  await expect
    .element(screen.getByRole("heading", { name: "Tareas fiscales", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/fiscal-tasks");
  await expect.element(screen.getByText("Venta diferida vencida")).toBeVisible();
  expect(document.title).toBe("Tareas fiscales · Puro Sur");
  const sections = screen.getByRole("navigation", { name: "Caja y fiscal" });
  await expect.element(sections.getByText("TAREAS", { exact: true })).toBeVisible();
  await expect
    .element(sections.getByRole("link", { name: "Tareas fiscales" }))
    .toHaveAttribute("aria-current", "page");
  expect(sections.getByRole("link", { name: "Reembolsos de MP" }).query()).toBeNull();
  expect(sections.getByRole("link", { name: "Puntos de venta" }).query()).toBeNull();
});

test("lists the fiscal tasks after the refunds in the TAREAS group", async () => {
  const services = servicesFor(["refunds_area", "fiscal_information"]);
  window.history.pushState(null, "", "/fiscal-tasks");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const sections = screen.getByRole("navigation", { name: "Caja y fiscal" });
  await expect.element(sections.getByRole("link", { name: "Tareas fiscales" })).toBeVisible();
  const labels = sections
    .getByRole("link")
    .all()
    .map((link) => link.element().textContent?.trim());
  expect(labels).toEqual(["Reembolsos de MP", "Reembolsos sin API", "Tareas fiscales"]);
});

test("offers the refunds, and not the fiscal tasks, to a user who cannot see fiscal information", async () => {
  const services = servicesFor(["refunds_area"]);
  window.history.pushState(null, "", "/refunds/mercado-pago");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const sections = screen.getByRole("navigation", { name: "Caja y fiscal" });
  await expect.element(sections.getByRole("link", { name: "Reembolsos de MP" })).toBeVisible();
  expect(sections.getByRole("link", { name: "Tareas fiscales" }).query()).toBeNull();
});

test("keeps opening the points of sale from the Caja item, without the TAREAS group, to a user of the cash area alone", async () => {
  const services = servicesFor(["cash_area"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Caja" }));

  await expect
    .element(screen.getByRole("heading", { name: "Puntos de venta", level: 1 }))
    .toBeVisible();
  const sections = screen.getByRole("navigation", { name: "Caja y fiscal" });
  expect(sections.getByText("TAREAS", { exact: true }).query()).toBeNull();
});

test("sends a user who cannot see fiscal information and opens /fiscal-tasks to Mi cuenta, without loading it", async () => {
  const services = servicesFor(["cash_area"]);
  window.history.pushState(null, "", "/fiscal-tasks");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(services.fiscalTasksScreen.fetchFiscalTasks).not.toHaveBeenCalled();
});

test("sends a user who only sees fiscal information and opens the points of sale to Mi cuenta", async () => {
  const services = servicesFor(["fiscal_information"]);
  window.history.pushState(null, "", "/points-of-sale");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
});

test("offers to close each fiscal task only to a user with the capability to close them", async () => {
  const services = servicesFor(["fiscal_information"]);
  window.history.pushState(null, "", "/fiscal-tasks");
  const without = await render(<App help={emptyHelp} services={services} />);
  await expect.element(without.getByText("Venta diferida vencida")).toBeVisible();
  expect(without.getByRole("button", { name: "Cerrar tarea" }).query()).toBeNull();
  await without.unmount();

  const withCapability = await render(
    <App help={emptyHelp} services={servicesFor(["fiscal_information", "close_fiscal_tasks"])} />,
  );

  await expect
    .element(withCapability.getByRole("button", { name: "Cerrar tarea" }).first())
    .toBeVisible();
});
