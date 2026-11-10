import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../sessions/test-support/open-session";
import { App, type AppServices } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/help", "/people/users", "/people/roles", "/products"]);

beforeEach(resetPageState);

const martina = {
  id: "user-2",
  firstName: "Martina Gómez",
  email: "martina@example.com",
  version: 1,
  active: true,
  role: { id: "role-admin", isAdministrator: true, name: null },
  passkeyCount: 1,
  isLastActiveAdministrator: false,
  mayEmitPinCode: true,
  mayEdit: true,
  mayDeactivate: false,
  mayReactivate: false,
  mayRemovePasskey: true,
};

function servicesFor(capabilities?: Capability[]): AppServices {
  const services = createAppServices(
    capabilities === undefined
      ? {}
      : {
          fetchSession: vi
            .fn()
            .mockResolvedValue(
              openSession({ userId: "user-9", isAdministrator: false, capabilities }),
            ),
        },
  );
  vi.mocked(services.usersListScreen.fetchUsers).mockResolvedValue({
    kind: "ok",
    value: [martina],
  });
  vi.mocked(services.usersListScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.userPanel.fetchUser).mockResolvedValue({ kind: "ok", value: martina });
  vi.mocked(services.userPanel.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.rolesListScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.ownCredentialsSection.fetchPasskeys).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  return services;
}

function location() {
  return window.location.pathname + window.location.search;
}

test("opens Personas on its Usuarios tab, with the Roles tab and the assistant's button for an Administrator", async () => {
  window.history.pushState(null, "", "/people");
  const screen = await render(<App help={emptyHelp} services={servicesFor()} />);

  await expect.element(screen.getByRole("heading", { name: "Personas", level: 1 })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Usuarios", selected: true })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Roles" })).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Ante una sospecha de compromiso" }))
    .toBeVisible();
  expect(location()).toBe("/people/users");
  await expect.poll(() => document.title).toBe("Personas · Puro Sur");
  const personas = screen.getByRole("link", { name: "Personas" }).element();
  expect(personas.getAttribute("aria-current")).toBe("page");
  const config = screen.getByRole("link", { name: "Configuración" }).element();
  expect(config.getAttribute("aria-current")).toBe("page");
});

test("the settings menu has no Usuarios, Mi cuenta, Roles or Respuesta ante un compromiso item", async () => {
  window.history.pushState(null, "", "/people/users");
  const screen = await render(<App help={emptyHelp} services={servicesFor()} />);
  await expect.element(screen.getByRole("link", { name: "Personas" })).toBeVisible();

  for (const name of ["Usuarios", "Mi cuenta", "Roles", "Respuesta ante un compromiso"]) {
    expect(screen.getByRole("link", { name }).query()).toBeNull();
  }
});

test("following the Roles tab opens the roles list under Personas", async () => {
  window.history.pushState(null, "", "/people/users");
  const screen = await render(<App help={emptyHelp} services={servicesFor()} />);
  await expect.element(screen.getByRole("tab", { name: "Roles" })).toBeVisible();

  await userEvent.click(screen.getByRole("tab", { name: "Roles" }));

  await expect.element(screen.getByRole("button", { name: "Nuevo rol" })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Roles", selected: true })).toBeVisible();
  expect(location()).toBe("/people/roles");
});

test("shows only the Usuarios tab to a person with users_area but not manage_roles, and sends /people/roles to it", async () => {
  window.history.pushState(null, "", "/people/roles");
  const services = servicesFor(["users_area"]);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Usuarios", selected: true })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Roles" }).query()).toBeNull();
  expect(location()).toBe("/people/users");
  expect(services.rolesListScreen.fetchRoles).not.toHaveBeenCalled();
});

test("shows only the Roles tab to a person with manage_roles but not users_area, and sends /people/users to it", async () => {
  window.history.pushState(null, "", "/people/users");
  const services = servicesFor(["manage_roles"]);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Roles", selected: true })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Usuarios" }).query()).toBeNull();
  expect(location()).toBe("/people/roles");
  expect(services.usersListScreen.fetchUsers).not.toHaveBeenCalled();
});

test("sends /people to the own account panel over Inicio for a person with neither tab, whose panel has no Datos", async () => {
  window.history.pushState(null, "", "/people");
  const services = servicesFor([]);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "Datos" }).query()).toBeNull();
  expect(location()).toBe("/?account=credentials");
  expect(screen.getByRole("link", { name: "Personas" }).query()).toBeNull();
  expect(services.usersListScreen.fetchUsers).not.toHaveBeenCalled();
});

test("redirects /users to /people/users keeping the state filter", async () => {
  window.history.pushState(null, "", "/users?state=inactive");
  const screen = await render(<App help={emptyHelp} services={servicesFor()} />);

  await expect.element(screen.getByRole("heading", { name: "Personas", level: 1 })).toBeVisible();
  expect(location()).toBe("/people/users?state=inactive");
});

test("redirects /users/:id to the users list with that user's panel open", async () => {
  window.history.pushState(null, "", "/users/user-2");
  const screen = await render(<App help={emptyHelp} services={servicesFor()} />);

  await expect.element(screen.getByRole("complementary", { name: "Martina Gómez" })).toBeVisible();
  expect(location()).toBe("/people/users?user=user-2");
});

test("redirects /roles to /people/roles", async () => {
  window.history.pushState(null, "", "/roles");
  const screen = await render(<App help={emptyHelp} services={servicesFor()} />);

  await expect.element(screen.getByRole("button", { name: "Nuevo rol" })).toBeVisible();
  expect(location()).toBe("/people/roles");
});

test("redirects /account to Inicio with the own account panel open", async () => {
  window.history.pushState(null, "", "/account");
  const screen = await render(<App help={emptyHelp} services={servicesFor()} />);

  await expect
    .element(screen.getByRole("tab", { name: "Passkeys y PIN", selected: true }))
    .toBeVisible();
  expect(location()).toBe("/?account=credentials");
});

test("a route refused for a missing capability sends the person to the own account panel over Inicio", async () => {
  window.history.pushState(null, "", "/contingency-ticket-rescue");
  const screen = await render(<App help={emptyHelp} services={servicesFor([])} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(location()).toBe("/?account=credentials");
});

test("pressing a user in the list opens the panel beside it, naming the user in the URL, and reloading reopens it", async () => {
  window.history.pushState(null, "", "/people/users");
  const services = servicesFor();
  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("link", { name: "Martina Gómez" }));

  await expect.element(screen.getByRole("complementary", { name: "Martina Gómez" })).toBeVisible();
  expect(location()).toBe("/people/users?user=user-2");
  await expect.element(screen.getByRole("tab", { name: "Datos", selected: true })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Estado" })).toBeVisible();
  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  await screen.unmount();

  const reloaded = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(reloaded.getByRole("complementary", { name: "Martina Gómez" }))
    .toBeVisible();
});

test("opens the panel tab the URL names, and moving between tabs rewrites the URL", async () => {
  window.history.pushState(null, "", "/people/users?user=user-2&tab=status");
  const screen = await render(<App help={emptyHelp} services={servicesFor()} />);
  await expect.element(screen.getByRole("tab", { name: "Estado", selected: true })).toBeVisible();

  await userEvent.click(screen.getByRole("tab", { name: "Datos" }));

  await expect
    .element(
      screen.getByRole("complementary", { name: "Martina Gómez" }).getByText("martina@example.com"),
    )
    .toBeVisible();
  expect(location()).toBe("/people/users?tab=data&user=user-2");
});

test("closing the panel removes the user and the tab from the URL", async () => {
  window.history.pushState(null, "", "/people/users?user=user-2&tab=status");
  const screen = await render(<App help={emptyHelp} services={servicesFor()} />);
  await expect.element(screen.getByRole("complementary", { name: "Martina Gómez" })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  await expect
    .element(screen.getByRole("complementary", { name: "Martina Gómez" }))
    .not.toBeInTheDocument();
  expect(location()).toBe("/people/users");
});

test("closes the panel of a user the list does not show, replacing the URL without a new history entry", async () => {
  window.history.pushState(null, "", "/people/users?user=user-404");
  const entries = window.history.length;
  const services = servicesFor();

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("Martina Gómez")).toBeVisible();
  await expect.poll(location).toBe("/people/users");
  expect(window.history.length).toBe(entries);
  expect(services.userPanel.fetchUser).not.toHaveBeenCalled();
});

test("drops a tab value the panel does not offer from the URL", async () => {
  window.history.pushState(null, "", "/people/users?user=user-2&tab=invoices");
  const screen = await render(<App help={emptyHelp} services={servicesFor()} />);

  await expect.element(screen.getByRole("tab", { name: "Datos", selected: true })).toBeVisible();
  expect(location()).toBe("/people/users?user=user-2");
});

test("pressing the name in the footer opens the own account panel over the current page, and closing it leaves the page", async () => {
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={emptyHelp} services={servicesFor()} />);

  await userEvent.click(screen.getByRole("link", { name: "Lucas Medrano" }));

  await expect.element(screen.getByRole("complementary", { name: "Lucas Medrano" })).toBeVisible();
  await expect
    .element(screen.getByRole("tab", { name: "Passkeys y PIN", selected: true }))
    .toBeVisible();
  expect(location()).toBe("/help?account=credentials");
  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  await expect
    .element(screen.getByRole("complementary", { name: "Lucas Medrano" }))
    .not.toBeInTheDocument();
  expect(location()).toBe("/help");
});

test("the own account panel shows Datos with users_area, reading the person's own user", async () => {
  window.history.pushState(null, "", "/help?account=data");
  const services = servicesFor();

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Datos", selected: true })).toBeVisible();
  await expect.element(screen.getByText("martina@example.com")).toBeVisible();
  expect(services.userPanel.fetchUser).toHaveBeenCalledWith("user-1");
});

test("the own account panel survives the page's own search, and shows only Passkeys y PIN without users_area", async () => {
  window.history.pushState(null, "", "/people/roles?account=data");
  const services = servicesFor(["manage_roles"]);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("tab", { name: "Passkeys y PIN", selected: true }))
    .toBeVisible();
  expect(screen.getByRole("tab", { name: "Datos" }).query()).toBeNull();
  expect(location()).toBe("/people/roles?account=data");
});

test("the own account panel stays open over a list page that writes its filters into the URL", async () => {
  window.history.pushState(null, "", "/products?account=credentials");
  const services = servicesFor();
  vi.mocked(services.productsListScreen.fetchProducts).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.productsListScreen.fetchCategories).mockResolvedValue({
    kind: "ok",
    value: [],
  });
  const screen = await render(<App help={emptyHelp} services={services} />);
  const searchBox = screen.getByPlaceholder("Buscar por nombre o código de barras");
  await expect.element(searchBox).toBeVisible();
  await expect.element(screen.getByRole("complementary", { name: "Lucas Medrano" })).toBeVisible();
  expect(location()).toBe("/products?account=credentials");

  await userEvent.fill(searchBox, "miel");

  await expect.poll(() => new URLSearchParams(window.location.search).get("search")).toBe("miel");
  expect(new URLSearchParams(window.location.search).get("account")).toBe("credentials");
  await expect.element(screen.getByRole("complementary", { name: "Lucas Medrano" })).toBeVisible();
});

test("the Config entry of the rail opens Personas, the first Configuración page, and falls back to the own account panel when there is none", async () => {
  window.history.pushState(null, "", "/help");
  const withPeople = await render(<App help={emptyHelp} services={servicesFor()} />);
  const config = withPeople.getByRole("link", { name: "Configuración" });
  await expect.element(config).toBeVisible();
  expect(config.element().getAttribute("href")).toBe("/people");
  await withPeople.unmount();

  const withNothing = await render(<App help={emptyHelp} services={servicesFor([])} />);
  const fallbackConfig = withNothing.getByRole("link", { name: "Configuración" });
  await expect.element(fallbackConfig).toBeVisible();
  expect(fallbackConfig.element().getAttribute("href")).toBe("/?account=credentials");
});

test("the open user's panel reaches the bottom of the page beside a short list", async () => {
  window.history.pushState(null, "", "/people/users?user=user-2");
  const screen = await render(<App help={emptyHelp} services={servicesFor()} />);

  const panel = screen.getByRole("complementary", { name: "Martina Gómez" });
  await expect.element(panel).toBeVisible();

  expect(panel.element().getBoundingClientRect().bottom).toBeCloseTo(window.innerHeight, 0);
});
