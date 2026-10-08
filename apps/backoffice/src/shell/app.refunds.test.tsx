import type { Capability } from "@purosur/domain";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../access/test-support/open-session";
import { pendingRefunds } from "../sales/test-support/refund-fixtures";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";

beforeEach(resetPageState);

afterEach(resetPageState);

function refundsServices(capabilities: Capability[]) {
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
  vi.mocked(services.pendingRefundsScreen.fetchPendingRefunds).mockResolvedValue({
    kind: "ok",
    value: pendingRefunds,
  });
  return services;
}

test("opens the pending refunds from the rail's Caja item for a user who only confirms refunds", async () => {
  const services = refundsServices(["refunds_area"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Caja" }));

  await expect
    .element(screen.getByRole("heading", { name: "Reembolsos pendientes", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/pending-refunds");
  await expect.element(screen.getByText("Caja principal")).toBeVisible();
  expect(document.title).toBe("Reembolsos pendientes · Puro Sur");
  const sections = screen.getByRole("navigation", { name: "Caja y fiscal" });
  await expect
    .element(sections.getByRole("link", { name: "Reembolsos pendientes" }))
    .toHaveAttribute("aria-current", "page");
  expect(sections.getByRole("link", { name: "Puntos de venta" }).query()).toBeNull();
  expect(sections.getByRole("link", { name: "Configuración fiscal" }).query()).toBeNull();
});

test("keeps opening the points of sale from the Caja item, without offering the refunds, to a user who cannot confirm them", async () => {
  const services = refundsServices(["cash_area"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Caja" }));

  await expect
    .element(screen.getByRole("heading", { name: "Puntos de venta", level: 1 }))
    .toBeVisible();
  const sections = screen.getByRole("navigation", { name: "Caja y fiscal" });
  await expect.element(sections.getByRole("link", { name: "Puntos de venta" })).toBeVisible();
  expect(sections.getByRole("link", { name: "Reembolsos pendientes" }).query()).toBeNull();
});

test("offers every section of Caja to a user who holds both capabilities", async () => {
  const services = refundsServices(["cash_area", "refunds_area"]);
  window.history.pushState(null, "", "/points-of-sale");

  const screen = await render(<App help={emptyHelp} services={services} />);

  const sections = screen.getByRole("navigation", { name: "Caja y fiscal" });
  await expect.element(sections.getByRole("link", { name: "Puntos de venta" })).toBeVisible();
  await expect.element(sections.getByRole("link", { name: "Configuración fiscal" })).toBeVisible();
  await expect.element(sections.getByRole("link", { name: "Reembolsos pendientes" })).toBeVisible();
});

test("hides the Caja item for a user with neither capability", async () => {
  const services = refundsServices(["stock_area"]);
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Caja" }).query()).toBeNull();
});

test("sends a user who cannot confirm refunds and opens them to Mi cuenta", async () => {
  const services = refundsServices(["cash_area"]);
  window.history.pushState(null, "", "/pending-refunds");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(services.pendingRefundsScreen.fetchPendingRefunds).not.toHaveBeenCalled();
});

test("sends a user who only confirms refunds and opens the points of sale to Mi cuenta", async () => {
  const services = refundsServices(["refunds_area"]);
  window.history.pushState(null, "", "/points-of-sale");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
});
