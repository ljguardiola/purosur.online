import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/account", "/compromise-response"]);

beforeEach(resetPageState);

function sessionHolding(capabilities: Capability[]) {
  return openSession({ userId: "user-2", isAdministrator: false, capabilities });
}

test("shows the Respuesta ante un compromiso item to a user who manages users, opening its screen", async () => {
  window.history.pushState(null, "", "/account");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(sessionHolding(["manage_users"])),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.compromiseResponseScreen.fetchCompromiseResponse).mockResolvedValue({
    kind: "ok",
    value: null,
  });
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByRole("link", { name: "Respuesta ante un compromiso" }));

  await expect
    .element(screen.getByRole("heading", { name: "Respuesta ante un compromiso", level: 1 }))
    .toBeVisible();
  expect(window.location.pathname).toBe("/compromise-response");
  const item = screen
    .getByRole("link", { name: "Respuesta ante un compromiso" })
    .element() as HTMLAnchorElement;
  expect(item.getAttribute("aria-current")).toBe("page");
});

test("hides the Respuesta ante un compromiso item from a user who cannot manage users", async () => {
  window.history.pushState(null, "", "/account");
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(sessionHolding([])),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();

  expect(screen.getByRole("link", { name: "Respuesta ante un compromiso" }).query()).toBeNull();
});

test("redirects a typed /compromise-response to Mi cuenta for a user who cannot manage users, without calling the cloud", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(sessionHolding([])),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/compromise-response");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/account");
  expect(services.compromiseResponseScreen.fetchCompromiseResponse).not.toHaveBeenCalled();
});
