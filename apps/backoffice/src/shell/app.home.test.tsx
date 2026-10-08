import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../access/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";

beforeEach(resetPageState);

afterEach(resetPageState);

test("shows the Inicio item in the rail for a non-administrator, linking to Inicio", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        capabilities: ["alerts_area"],
      }),
    ),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("href", "/");
});

test("lands a user without either alert-view permission on Inicio, telling them they have no alerts to view and offering no Alertas", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("No tenés alertas para ver")).toBeVisible();
  expect(window.location.pathname).toBe("/");
  await expect.element(screen.getByRole("link", { name: "Resumen" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Alertas" }).query()).toBeNull();
  expect(services.alertsOverviewScreen.fetchAlertsOverview).not.toHaveBeenCalled();
});

test("following the rail's Inicio item opens Inicio, and its Alertas section link the Alertas list", async () => {
  window.history.pushState(null, "", "/help");
  const services = createAppServices();
  vi.mocked(services.alertsListScreen.fetchAlerts).mockResolvedValue({
    kind: "ok",
    value: { alerts: [], total: 0, pageSize: 25, openCount: 0, openCriticalCount: 0 },
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("link", { name: "Inicio" })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Inicio" }));

  await expect.element(screen.getByRole("heading", { name: "Inicio", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/");

  await userEvent.click(screen.getByRole("link", { name: "Alertas" }));

  await expect.element(screen.getByRole("heading", { name: "Alertas", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/alerts");
  const homeItem = screen.getByRole("link", { name: "Inicio" }).element() as HTMLAnchorElement;
  expect(homeItem.getAttribute("aria-current")).toBe("page");
  const alertsItem = screen.getByRole("link", { name: "Alertas" }).element() as HTMLAnchorElement;
  expect(alertsItem.getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "Resumen" }).element().hasAttribute("aria-current")).toBe(
    false,
  );
});

test("opens the alerts list filtered by a level from that level's card on Inicio", async () => {
  window.history.pushState(null, "", "/");
  const services = createAppServices();
  vi.mocked(services.alertsOverviewScreen.fetchAlertsOverview).mockResolvedValue({
    kind: "ok",
    value: {
      critical: { openCount: 0, kinds: [] },
      warning: { openCount: 2, kinds: ["user_email_changed"] },
      informational: { openCount: 0, kinds: [] },
    },
  });
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByRole("link", { name: /^Advertencias 2/ }));

  await expect.element(screen.getByRole("heading", { name: "Alertas", level: 1 })).toBeVisible();
  expect(`${window.location.pathname}${window.location.search}`).toBe("/alerts?level=warning");
  await expect
    .poll(() => services.alertsListScreen.fetchAlerts)
    .toHaveBeenCalledWith({ level: "warning", open: true, page: 1 });
});

test("shows each register of the branch with its last successful sync on Inicio", async () => {
  window.history.pushState(null, "", "/");
  const services = createAppServices();
  vi.mocked(services.registersSyncSection.fetchRegisterSyncStatus).mockResolvedValue({
    kind: "ok",
    value: [
      { id: "register-1", name: "Caja 1", lastSuccessfulSyncAt: "2026-03-02T09:30:00.000Z" },
      { id: "register-2", name: "Caja 2", lastSuccessfulSyncAt: null },
    ],
  });

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Cajas", level: 2 })).toBeVisible();
  await expect
    .element(screen.getByRole("row", { name: /^Caja 1 02\/03\/2026 06:30$/ }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("row", { name: /^Caja 2 Nunca sincronizó$/ }))
    .toBeVisible();
});

test("keeps the alerts on Inicio when the registers fail to load, and retries only the registers", async () => {
  window.history.pushState(null, "", "/");
  const services = createAppServices();
  vi.mocked(services.alertsOverviewScreen.fetchAlertsOverview).mockResolvedValue({
    kind: "ok",
    value: {
      critical: { openCount: 0, kinds: [] },
      warning: { openCount: 2, kinds: ["user_email_changed"] },
      informational: { openCount: 0, kinds: [] },
    },
  });
  vi.mocked(services.registersSyncSection.fetchRegisterSyncStatus)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValueOnce({
      kind: "ok",
      value: [{ id: "register-1", name: "Caja 1", lastSuccessfulSyncAt: null }],
    });

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("No pudimos abrir las cajas")).toBeVisible();
  await expect.element(screen.getByRole("link", { name: /^Advertencias 2/ })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Nunca sincronizó")).toBeVisible();
  expect(services.alertsOverviewScreen.fetchAlertsOverview).toHaveBeenCalledTimes(1);
});

test("asks the cloud nothing about registers for a user who may not see alerts on Inicio", async () => {
  window.history.pushState(null, "", "/");
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("No tenés alertas para ver")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Cajas", level: 2 }).query()).toBeNull();
  expect(services.registersSyncSection.fetchRegisterSyncStatus).not.toHaveBeenCalled();
});
