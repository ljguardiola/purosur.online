import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import {
  emptyCashMovementsReport,
  weekCashMovementsReport,
} from "../register/test-support/cash-movements-fixtures";
import { weekCashSessionClosesReport } from "../register/test-support/cash-session-closes-fixtures";
import { register1 } from "../register/test-support/registers-list-screen";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { registers } from "./test-support/report-fixtures";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens([
  "/",
  "/help",
  "/refunds",
  "/registers",
  "/registers/closes",
  "/registers/movements",
]);

beforeEach(resetPageState);

const REGISTER_ID = "11111111-1111-4111-8111-111111111111";

function registersServices(capabilities: Capability[]) {
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
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.registersListScreen.fetchRegisters).mockResolvedValue({
    kind: "ok",
    value: [register1],
  });
  vi.mocked(services.registersListScreen.fetchRegisterCoverage).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.cashSessionClosesScreen.fetchCashSessionCloses).mockResolvedValue({
    kind: "ok",
    value: weekCashSessionClosesReport,
  });
  vi.mocked(services.cashMovementsScreen.fetchCashMovements).mockResolvedValue({
    kind: "ok",
    value: weekCashMovementsReport,
  });
  vi.mocked(services.reportRegisterFilter.fetchReportRegisters).mockResolvedValue({
    kind: "ok",
    value: registers,
  });
  return services;
}

function location() {
  return window.location.pathname + window.location.search;
}

test("opens the page on Cajas from the rail's Ventas y caja item, with the three tabs, for a person with every capability", async () => {
  const services = registersServices([
    "registers_area",
    "reports_area",
    "fiscal_configuration_area",
    "backups_area",
  ]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Ventas y caja", exact: true }));

  await expect.element(screen.getByRole("heading", { name: "Cajas", level: 1 })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Cajas", selected: true })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Cierres de caja" })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Movimientos de efectivo" })).toBeVisible();
  await expect.element(screen.getByText("Caja 1", { exact: true })).toBeVisible();
  expect(location()).toBe("/registers");
  expect(document.title).toBe("Cajas · Puro Sur");
  await expect.element(screen.getByRole("tablist", { name: "Secciones de Cajas" })).toBeVisible();
});

test("lists Cajas first in Ventas y caja, active on the page", async () => {
  const services = registersServices(["registers_area", "refunds_area"]);
  window.history.pushState(null, "", "/registers");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const sections = screen.getByRole("navigation", { name: "Ventas y caja" });
  await expect
    .element(sections.getByRole("link", { name: "Cajas" }))
    .toHaveAttribute("aria-current", "page");
  const labels = sections
    .getByRole("link")
    .all()
    .map((link) => link.element().textContent?.trim());
  expect(labels).toEqual(["Cajas", "Devoluciones y reembolsos"]);
});

test("following the Cierres de caja and Movimientos de efectivo tabs opens each screen, and Cajas comes back", async () => {
  const services = registersServices(["registers_area", "reports_area"]);
  window.history.pushState(null, "", "/registers");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("Caja 1", { exact: true })).toBeVisible();

  await userEvent.click(screen.getByRole("tab", { name: "Cierres de caja" }));

  await expect
    .element(screen.getByRole("tab", { name: "Cierres de caja", selected: true }))
    .toBeVisible();
  await expect.element(screen.getByText("Cerró: Beto")).toBeVisible();
  expect(location()).toBe("/registers/closes");
  expect(services.cashSessionClosesScreen.fetchCashSessionCloses).toHaveBeenCalledWith({});

  await userEvent.click(screen.getByRole("tab", { name: "Movimientos de efectivo" }));

  await expect
    .element(screen.getByRole("tab", { name: "Movimientos de efectivo", selected: true }))
    .toBeVisible();
  await expect.element(screen.getByText("Compra de hielo")).toBeVisible();
  expect(location()).toBe("/registers/movements");

  await userEvent.click(screen.getByRole("tab", { name: "Cajas", exact: true }));

  await expect.element(screen.getByRole("tab", { name: "Cajas", selected: true })).toBeVisible();
  expect(location()).toBe("/registers");
});

test("keeps the closes' period in the address", async () => {
  const services = registersServices(["reports_area"]);
  window.history.pushState(null, "", "/registers/closes?from=2026-10-01&to=2026-10-07");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("Cerró: Beto")).toBeVisible();
  expect(services.cashSessionClosesScreen.fetchCashSessionCloses).toHaveBeenCalledWith({
    from: "2026-10-01",
    to: "2026-10-07",
  });
  expect(location()).toBe("/registers/closes?from=2026-10-01&to=2026-10-07");
});

test("shows only the reports' tabs to a person with reports_area alone, and sends /registers to Cierres de caja", async () => {
  const services = registersServices(["reports_area"]);
  window.history.pushState(null, "", "/registers");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("tab", { name: "Cierres de caja", selected: true }))
    .toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Movimientos de efectivo" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Cajas", exact: true }).query()).toBeNull();
  expect(location()).toBe("/registers/closes");
  expect(services.registersListScreen.fetchRegisters).not.toHaveBeenCalled();
});

test("sends a person without reports_area who opens a reports tab to Cajas", async () => {
  const services = registersServices(["registers_area"]);
  window.history.pushState(null, "", "/registers/closes");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Cajas", selected: true })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Cierres de caja" }).query()).toBeNull();
  expect(location()).toBe("/registers");
  expect(services.cashSessionClosesScreen.fetchCashSessionCloses).not.toHaveBeenCalled();
});

test.each(["/registers", "/registers/closes", "/registers/movements"])(
  "sends a person with none of the four capabilities who opens %s to the own account panel",
  async (path) => {
    const services = registersServices(["refunds_area"]);
    window.history.pushState(null, "", path);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
    expect(location()).toBe("/?account=credentials");
    expect(services.registersListScreen.fetchRegisters).not.toHaveBeenCalled();
    expect(services.cashSessionClosesScreen.fetchCashSessionCloses).not.toHaveBeenCalled();
    expect(services.cashMovementsScreen.fetchCashMovements).not.toHaveBeenCalled();
  },
);

test("redirects /backups to /registers", async () => {
  const services = registersServices(["registers_area", "backups_area"]);
  window.history.pushState(null, "", "/backups");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Cajas", selected: true })).toBeVisible();
  expect(location()).toBe("/registers");
});

test("redirects /backups naming a register to /registers with that register and the Copias tab", async () => {
  const services = registersServices(["registers_area", "backups_area"]);
  window.history.pushState(null, "", `/backups?register=${REGISTER_ID}`);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Cajas", selected: true })).toBeVisible();
  expect(location()).toBe(`/registers?register=${REGISTER_ID}&tab=backups`);
});

test("redirects /reports/cash-session-closes to /registers/closes keeping the period and the register", async () => {
  const services = registersServices(["reports_area"]);
  window.history.pushState(
    null,
    "",
    `/reports/cash-session-closes?from=2026-10-01&to=2026-10-07&register=${REGISTER_ID}`,
  );

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("tab", { name: "Cierres de caja", selected: true }))
    .toBeVisible();
  expect(location()).toBe(
    `/registers/closes?from=2026-10-01&register=${REGISTER_ID}&to=2026-10-07`,
  );
});

test("redirects /reports/cash-movements to /registers/movements keeping the period and the register", async () => {
  const services = registersServices(["reports_area"]);
  vi.mocked(services.cashMovementsScreen.fetchCashMovements).mockResolvedValue({
    kind: "ok",
    value: emptyCashMovementsReport,
  });
  window.history.pushState(
    null,
    "",
    `/reports/cash-movements?from=2026-10-01&to=2026-10-07&register=${REGISTER_ID}`,
  );

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("tab", { name: "Movimientos de efectivo", selected: true }))
    .toBeVisible();
  expect(location()).toBe(
    `/registers/movements?from=2026-10-01&register=${REGISTER_ID}&to=2026-10-07`,
  );
});

test("takes a person with reports_area alone to Cierres de caja from the rail", async () => {
  const services = registersServices(["reports_area"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Ventas y caja", exact: true }));

  await expect
    .element(screen.getByRole("tab", { name: "Cierres de caja", selected: true }))
    .toBeVisible();
  expect(location()).toBe("/registers/closes");
});

test("leaves the closes and the movements out of the Reportes column", async () => {
  const services = registersServices(["reports_area"]);
  window.history.pushState(null, "", "/reports");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const sections = screen.getByRole("navigation", { name: "Reportes" });
  await expect.element(sections.getByRole("link", { name: "Todos los reportes" })).toBeVisible();
  expect(sections.getByRole("link", { name: "Cierres de sesión" }).query()).toBeNull();
  expect(sections.getByRole("link", { name: "Movimientos de caja" }).query()).toBeNull();
});
