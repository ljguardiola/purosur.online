import type { Capability } from "@purosur/domain";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/account", "/help", "/quarantined-events"]);

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
