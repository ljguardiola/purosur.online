import type { AlertDetail } from "@purosur/contracts";
import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/help", "/held-register-changes"]);

beforeEach(resetPageState);

function sessionHolding(capabilities: Capability[]) {
  return openSession({ userId: "user-2", isAdministrator: false, capabilities });
}

test("shows the Cambios de cajas retenidos item under Diagnóstico to a user holding quarantined_events, opening its screen, titled after it, from the Configuración rail", async () => {
  window.history.pushState(null, "", "/help");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(sessionHolding(["quarantined_events"])),
  });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  vi.mocked(services.quarantinedEventsScreen.fetchQuarantinedEvents).mockResolvedValue({
    kind: "ok",
    value: { events: [] },
  });
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByRole("link", { name: "Configuración" }));

  await expect
    .element(screen.getByRole("heading", { name: "Cambios de cajas retenidos", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/held-register-changes");
  expect(document.title).toBe("Cambios de cajas retenidos · Puro Sur");
  const sections = screen.getByRole("navigation", { name: "Configuración" });
  await expect
    .element(sections.getByRole("heading", { name: "Diagnóstico", level: 3 }))
    .toBeVisible();
  await expect
    .element(
      sections
        .getByRole("list", { name: "Diagnóstico" })
        .getByRole("link", { name: "Cambios de cajas retenidos" }),
    )
    .toHaveAttribute("aria-current", "page");
});

test("hides the Cambios de cajas retenidos item from a user without quarantined_events", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(sessionHolding([])),
  });
  window.history.pushState(null, "", "/help");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("navigation", { name: "Áreas" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Cambios de cajas retenidos" }).query()).toBeNull();
});

test("redirects the old /quarantined-events address to /held-register-changes", async () => {
  window.history.pushState(null, "", "/quarantined-events");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(sessionHolding(["quarantined_events"])),
  });
  vi.mocked(services.quarantinedEventsScreen.fetchQuarantinedEvents).mockResolvedValue({
    kind: "ok",
    value: { events: [] },
  });

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Cambios de cajas retenidos", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/held-register-changes");
});

test("redirects a typed /held-register-changes to Mi cuenta for a user without quarantined_events, without calling its API", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(sessionHolding([])),
  });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  window.history.pushState(null, "", "/held-register-changes");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(window.location.pathname + window.location.search).toBe("/?account=credentials");
  expect(services.quarantinedEventsScreen.fetchQuarantinedEvents).not.toHaveBeenCalled();
});

const quarantinedEventAlert: AlertDetail = {
  id: "alert-1",
  kind: "events_quarantined",
  scope: "device-1",
  scopeDisplay: "Caja 1",
  scopeKind: "syncDevice",
  level: "critical",
  audience: "all",
  detail: { deviceId: "device-1" },
  openedAt: "2026-01-05T12:00:00.000Z",
  escalatedAt: null,
  resolvedAt: null,
  open: true,
  closing: "when_its_events_are_released",
  deliveries: [],
};

test("follows a quarantined event's alert to the quarantined events list", async () => {
  window.history.pushState(null, "", "/");
  const { open, closing, deliveries, detail, ...summary } = quarantinedEventAlert;
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(sessionHolding(["alerts_area", "quarantined_events"])),
    homeScreen: {
      ...createAppServices().homeScreen,
      fetchAlerts: vi.fn().mockResolvedValue({
        kind: "ok",
        value: {
          alerts: [{ ...summary, salesDeniedReason: null, refundAmount: null, refundMethod: null }],
          total: 1,
          pageSize: 25,
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
    screen.getByRole("button", { name: "Ver la alerta «Cambios de cajas retenidos»" }),
  );
  await userEvent.click(screen.getByRole("link", { name: "Ver cambios de cajas retenidos" }));

  await expect
    .element(screen.getByRole("heading", { name: "Cambios de cajas retenidos", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/held-register-changes");
  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
});
