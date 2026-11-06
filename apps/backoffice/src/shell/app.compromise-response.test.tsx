import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../sessions/test-support/open-session";
import { App } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/people/users"]);

beforeEach(resetPageState);

function sessionHolding(capabilities: Capability[]) {
  return openSession({ userId: "user-2", isAdministrator: false, capabilities });
}

const ASSISTANT = "Respuesta ante un compromiso";

function servicesFor(capabilities: Capability[]) {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(sessionHolding(capabilities)),
  });
  vi.mocked(services.usersListScreen.fetchUsers).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.usersListScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.compromiseResponseScreen.fetchCompromiseResponse).mockResolvedValue({
    kind: "ok",
    value: null,
  });
  return services;
}

test("offers the assistant in Personas to a user who manages users, opening it over the page through the URL", async () => {
  window.history.pushState(null, "", "/people/users");
  const services = servicesFor(["users_area", "manage_users"]);
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByRole("button", { name: "Ante una sospecha de compromiso" }));

  await expect.element(screen.getByRole("dialog", { name: ASSISTANT })).toBeVisible();
  expect(window.location.pathname + window.location.search).toBe(
    "/people/users?assistant=compromise-response",
  );
});

test("closing the assistant removes it from the URL, keeping the page", async () => {
  window.history.pushState(null, "", "/people/users?assistant=compromise-response");
  const services = servicesFor(["users_area", "manage_users"]);
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("dialog", { name: ASSISTANT })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  await expect.element(screen.getByRole("dialog", { name: ASSISTANT })).not.toBeInTheDocument();
  expect(window.location.pathname + window.location.search).toBe("/people/users");
});

test("hides the assistant's button from a user who cannot manage users", async () => {
  window.history.pushState(null, "", "/people/users");
  const services = servicesFor(["users_area"]);
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Personas", level: 1 })).toBeVisible();

  expect(
    screen.getByRole("button", { name: "Ante una sospecha de compromiso" }).query(),
  ).toBeNull();
});

test("drops the assistant from the URL for a user who cannot manage users, without calling the cloud", async () => {
  window.history.pushState(null, "", "/people/users?assistant=compromise-response");
  const services = servicesFor(["users_area"]);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Personas", level: 1 })).toBeVisible();
  expect(screen.getByRole("dialog", { name: ASSISTANT }).query()).toBeNull();
  expect(window.location.pathname + window.location.search).toBe("/people/users");
  expect(services.compromiseResponseScreen.fetchCompromiseResponse).not.toHaveBeenCalled();
});

test("redirects a typed /compromise-response to Personas with the assistant open", async () => {
  window.history.pushState(null, "", "/compromise-response");
  const services = servicesFor(["users_area", "manage_users"]);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("dialog", { name: ASSISTANT })).toBeVisible();
  expect(window.location.pathname + window.location.search).toBe(
    "/people/users?assistant=compromise-response",
  );
});

test("redirects a typed /compromise-response to the own account panel for a user who sees no Personas, without calling the cloud", async () => {
  window.history.pushState(null, "", "/compromise-response");
  const services = servicesFor([]);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(window.location.pathname + window.location.search).toBe("/?account=credentials");
  expect(services.compromiseResponseScreen.fetchCompromiseResponse).not.toHaveBeenCalled();
});
