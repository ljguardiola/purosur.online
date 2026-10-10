import type { AlertDetail } from "@purosur/contracts";
import type { Capability } from "@purosur/domain";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/account", "/alerts", "/help", "/quarantined-events"]);

beforeEach(resetPageState);

afterEach(resetPageState);

function sessionHolding(capabilities: Capability[]) {
  return openSession({ userId: "user-2", isAdministrator: false, capabilities });
}

test("shows the Eventos en cuarentena item to a user holding quarantined_events, opening its screen", async () => {
  window.history.pushState(null, "", "/account");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(sessionHolding(["quarantined_events"])),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.quarantinedEventsScreen.fetchQuarantinedEvents).mockResolvedValue({
    kind: "ok",
    value: { events: [] },
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();

  await userEvent.click(screen.getByRole("link", { name: "Eventos en cuarentena" }));

  await expect
    .element(screen.getByRole("heading", { name: "Eventos en cuarentena", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/quarantined-events");
  const item = screen
    .getByRole("link", { name: "Eventos en cuarentena" })
    .element() as HTMLAnchorElement;
  expect(item.getAttribute("aria-current")).toBe("page");
});

test("hides the Eventos en cuarentena item from a user without quarantined_events", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(sessionHolding([])),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Eventos en cuarentena" }).query()).toBeNull();
});

test("redirects a typed /quarantined-events to Mi cuenta for a user without quarantined_events, without calling its API", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(sessionHolding([])),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/quarantined-events");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/account");
  expect(services.quarantinedEventsScreen.fetchQuarantinedEvents).not.toHaveBeenCalled();
});

const quarantinedEventAlert: AlertDetail = {
  id: "alert-1",
  kind: "events_quarantined",
  scope: "event-1",
  scopeDisplay: "event-1",
  level: "critical",
  audience: "all",
  detail: {
    deviceId: "device-1",
    eventId: "event-1",
    eventType: "sale_completed",
    aggregateType: "Sale",
    aggregateId: "sale-1",
    reason: { kind: "missing_dependency", aggregateType: "CashSession", aggregateId: "session-1" },
  },
  openedAt: "2026-01-05T12:00:00.000Z",
  escalatedAt: null,
  resolvedAt: null,
  open: true,
  resolvesByItself: false,
  deliveries: [],
};

test("follows a quarantined event's alert to the quarantined events list", async () => {
  window.history.pushState(null, "", "/alerts");
  const { open, resolvesByItself, deliveries, detail, ...summary } = quarantinedEventAlert;
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(sessionHolding(["alerts_area", "quarantined_events"])),
    alertsListScreen: {
      fetchAlerts: vi.fn().mockResolvedValue({
        kind: "ok",
        value: {
          alerts: [{ ...summary, salesDeniedReason: null }],
          total: 1,
          pageSize: 25,
          openCount: 1,
          openCriticalCount: 1,
        },
      }),
      alertDetailModal: {
        fetchAlert: vi.fn().mockResolvedValue({ kind: "ok", value: quarantinedEventAlert }),
        fetchPermissionCatalog: vi.fn(),
        closeAlert: vi.fn(),
      },
    },
  });
  vi.mocked(services.quarantinedEventsScreen.fetchQuarantinedEvents).mockResolvedValue({
    kind: "ok",
    value: { events: [] },
  });
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(
    screen.getByRole("button", { name: "Ver la alerta «Cuarentena de eventos»" }),
  );
  await userEvent.click(screen.getByRole("link", { name: "Ver eventos en cuarentena" }));

  await expect
    .element(screen.getByRole("heading", { name: "Eventos en cuarentena", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/quarantined-events");
  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
});
