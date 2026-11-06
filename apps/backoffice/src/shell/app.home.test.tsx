import type { AlertSummary } from "@purosur/contracts";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { FetchAlertsOutcome } from "../alerts/alerts-api";
import { fiscalTasks } from "../fiscal/test-support/fiscal-task-fixtures";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState, threeOpenAlerts } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/help"]);

beforeEach(resetPageState);

test("shows the Inicio item in the rail for a non-administrator, linking to Inicio", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Villalba",
        isAdministrator: false,
        capabilities: ["alerts_area"],
      }),
    ),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("href", "/");
});

const passkeyAlert: AlertSummary = {
  id: "alert-1",
  kind: "backoffice_passkey_changed",
  scope: "user-1",
  scopeDisplay: "Lucía Pérez",
  scopeKind: "user",
  level: "warning",
  audience: "all",
  openedAt: "2026-01-05T12:00:00.000Z",
  escalatedAt: null,
  resolvedAt: null,
  salesDeniedReason: null,
  refundAmount: null,
  refundMethod: null,
};

const oneAlert: FetchAlertsOutcome = {
  kind: "ok",
  value: { alerts: [passkeyAlert], total: 1, pageSize: 25, openCount: 3, openCriticalCount: 1 },
};

test("lands a user without the alerts permission on Inicio, with the registers and no alert section nor section column", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Villalba", isAdministrator: false }),
      ),
  });

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Inicio", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/");
  await expect
    .element(screen.getByRole("heading", { name: "Estado de las cajas", level: 2 }))
    .toBeVisible();
  expect(screen.getByText("No tenés alertas para ver").query()).toBeNull();
  expect(screen.getByRole("heading", { name: "Alertas abiertas" }).query()).toBeNull();
  expect(screen.getByRole("heading", { name: "Lista de alertas" }).query()).toBeNull();
  expect(screen.getByRole("link", { name: "Resumen" }).query()).toBeNull();
  expect(screen.getByRole("link", { name: "Alertas" }).query()).toBeNull();
  expect(services.homeScreen.fetchAlertsOverview).not.toHaveBeenCalled();
  expect(services.homeScreen.fetchAlerts).not.toHaveBeenCalled();
});

test("following the rail's Inicio item opens Inicio, which has no section column", async () => {
  window.history.pushState(null, "", "/help");
  const services = createAppServices();
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("link", { name: "Inicio" })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Inicio" }));

  await expect.element(screen.getByRole("heading", { name: "Inicio", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/");
  expect(screen.getByRole("navigation", { name: "Inicio" }).query()).toBeNull();
  expect(screen.getByRole("link", { name: "Resumen" }).query()).toBeNull();
  expect(screen.getByRole("link", { name: "Alertas" }).query()).toBeNull();
  const homeItem = screen.getByRole("link", { name: "Inicio" }).element();
  expect(homeItem.getAttribute("aria-current")).toBe("page");
});

test("shows the open alerts by level, the alert list, the registers and the pending tasks on Inicio, in that order", async () => {
  const services = createAppServices();
  vi.mocked(services.homeScreen.fetchAlertsOverview).mockResolvedValue(threeOpenAlerts);
  vi.mocked(services.homeScreen.fetchAlerts).mockResolvedValue(oneAlert);
  vi.mocked(services.homeScreen.fetchFiscalTasks).mockResolvedValue({
    kind: "ok",
    value: fiscalTasks,
  });

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("link", { name: `Tareas fiscales ${fiscalTasks.tasks.length}` }))
    .toBeVisible();
  const headings = screen
    .getByRole("heading", { level: 2 })
    .elements()
    .map((heading) => heading.textContent);
  expect(headings).toEqual([
    "Alertas abiertas",
    "Lista de alertas",
    "Estado de las cajas",
    "Tareas pendientes",
  ]);
});

test("filters the alert list by a level from that level's card on Inicio", async () => {
  const services = createAppServices();
  vi.mocked(services.homeScreen.fetchAlertsOverview).mockResolvedValue(threeOpenAlerts);
  vi.mocked(services.homeScreen.fetchAlerts).mockResolvedValue(oneAlert);
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("row", { name: /Lucía Pérez/ })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: /^Advertencias 2/ }));

  await expect
    .poll(() => `${window.location.pathname}${window.location.search}`)
    .toBe("/?level=warning");
  await expect
    .poll(() => services.homeScreen.fetchAlerts)
    .toHaveBeenCalledWith({ level: "warning", open: true, page: 1 });
  await expect.element(screen.getByRole("heading", { name: "Inicio", level: 1 })).toBeVisible();
});

test("opens the existing alert detail from a row of the list on Inicio", async () => {
  const services = createAppServices();
  vi.mocked(services.homeScreen.fetchAlerts).mockResolvedValue(oneAlert);
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByRole("button", { name: /Ver la alerta «Passkey»/ }));

  await expect
    .poll(() => services.homeScreen.alertDetailModal?.fetchAlert)
    .toHaveBeenCalledWith("alert-1");
});

test("lands /alerts on Inicio with the same filters applied, scrolled to the alert list", async () => {
  window.history.pushState(null, "", "/alerts?level=critical&status=closed&page=2");
  const services = createAppServices();

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Inicio", level: 1 })).toBeVisible();
  await expect
    .poll(() => `${window.location.pathname}${window.location.search}${window.location.hash}`)
    .toBe("/?level=critical&page=2&status=closed#alerts-list");
  await expect
    .poll(() => services.homeScreen.fetchAlerts)
    .toHaveBeenCalledWith({ level: "critical", open: false, page: 2 });
});

test("lands /alerts without filters on a clean Inicio URL", async () => {
  window.history.pushState(null, "", "/alerts");
  const services = createAppServices();

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Inicio", level: 1 })).toBeVisible();
  await expect
    .poll(() => `${window.location.pathname}${window.location.search}${window.location.hash}`)
    .toBe("/#alerts-list");
});

test("lands /alerts on Inicio for a user without the alerts permission, with no alert section", async () => {
  window.history.pushState(null, "", "/alerts?level=critical");
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Villalba", isAdministrator: false }),
      ),
  });

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Estado de las cajas", level: 2 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/");
  expect(screen.getByRole("heading", { name: "Lista de alertas" }).query()).toBeNull();
  expect(services.homeScreen.fetchAlerts).not.toHaveBeenCalled();
});

test("shows each register of the branch with its last successful sync on Inicio", async () => {
  window.history.pushState(null, "", "/");
  const services = createAppServices();
  vi.mocked(services.homeScreen.fetchRegisterSyncStatus).mockResolvedValue({
    kind: "ok",
    value: [
      { id: "register-1", name: "Caja 1", lastSuccessfulSyncAt: "2026-03-02T09:30:00.000Z" },
      { id: "register-2", name: "Caja 2", lastSuccessfulSyncAt: null },
    ],
  });

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Estado de las cajas", level: 2 }))
    .toBeVisible();
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
  vi.mocked(services.homeScreen.fetchAlertsOverview).mockResolvedValue({
    kind: "ok",
    value: {
      critical: { openCount: 0, kinds: [] },
      warning: { openCount: 2, kinds: ["user_email_changed"] },
      informational: { openCount: 0, kinds: [] },
    },
  });
  vi.mocked(services.homeScreen.fetchRegisterSyncStatus)
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
  expect(services.homeScreen.fetchAlertsOverview).toHaveBeenCalledTimes(1);
});

test("shows each register's last successful sync on Inicio to a user who may not see alerts", async () => {
  window.history.pushState(null, "", "/");
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Villalba", isAdministrator: false }),
      ),
  });
  vi.mocked(services.homeScreen.fetchRegisterSyncStatus).mockResolvedValue({
    kind: "ok",
    value: [{ id: "register-1", name: "Caja 1", lastSuccessfulSyncAt: null }],
  });

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("row", { name: /^Caja 1 Nunca sincronizó$/ }))
    .toBeVisible();
  expect(screen.getByText("No tenés alertas para ver").query()).toBeNull();
});
