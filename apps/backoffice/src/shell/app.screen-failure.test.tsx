import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";

beforeEach(resetPageState);

afterEach(resetPageState);

test("offers to try again when a screen fails to render, reports the failure, and shows the screen once it works", async () => {
  window.history.pushState(null, "", "/alerts");
  const services = createAppServices();
  const unreadable = { active: true };
  const page = {
    get alerts(): never[] {
      if (unreadable.active) {
        throw new TypeError("the alerts cannot be read");
      }
      return [];
    },
    total: 0,
    pageSize: 25,
    openCount: 0,
    openCriticalCount: 0,
  };
  vi.mocked(services.alertsListScreen.fetchAlerts).mockResolvedValue({ kind: "ok", value: page });
  const reportError = vi.fn();
  const screen = await render(
    <App help={emptyHelp} services={services} reportError={reportError} />,
  );

  await expect.element(screen.getByText("No pudimos mostrar esta pantalla")).toBeVisible();
  expect(reportError).toHaveBeenCalledTimes(1);
  expect(reportError).toHaveBeenCalledWith(expect.any(TypeError));

  unreadable.active = false;
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("heading", { name: "Alertas", level: 1 })).toHaveFocus();
  expect(screen.getByText("No pudimos mostrar esta pantalla").query()).toBeNull();
  expect(reportError).toHaveBeenCalledTimes(1);
});

test("moves focus to the failure's title when a screen opened from the rail fails once its data arrives", async () => {
  window.history.pushState(null, "", "/help");
  const services = createAppServices();
  vi.mocked(services.homeScreen.fetchAlertsOverview).mockResolvedValue({
    kind: "ok",
    value: { critical: null, warning: null, informational: null },
  } as never);
  const screen = await render(<App help={emptyHelp} services={services} reportError={vi.fn()} />);
  await expect.element(screen.getByRole("link", { name: "Inicio" })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Inicio" }));

  await expect
    .element(screen.getByRole("heading", { name: "No pudimos mostrar esta pantalla", level: 1 }))
    .toHaveFocus();
});

test("keeps focus on the failure's title when trying again fails again", async () => {
  window.history.pushState(null, "", "/alerts");
  const services = createAppServices();
  vi.mocked(services.alertsListScreen.fetchAlerts).mockResolvedValue({
    kind: "ok",
    value: { alerts: null, total: 0, pageSize: 25, openCount: 0, openCriticalCount: 0 },
  } as never);
  const reportError = vi.fn();
  const screen = await render(
    <App help={emptyHelp} services={services} reportError={reportError} />,
  );
  await expect
    .element(screen.getByRole("heading", { name: "No pudimos mostrar esta pantalla", level: 1 }))
    .toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.poll(() => reportError.mock.calls.length).toBeGreaterThan(1);
  await expect
    .element(screen.getByRole("heading", { name: "No pudimos mostrar esta pantalla", level: 1 }))
    .toHaveFocus();
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("Probá de nuevo en unos minutos.");
});
