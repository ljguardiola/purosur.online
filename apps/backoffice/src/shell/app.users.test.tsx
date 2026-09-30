import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../access/test-support/open-session";
import { App, type AppServices } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";

beforeEach(resetPageState);

afterEach(resetPageState);

test("routes /account to Mi cuenta inside the Shell, with Config and Usuarios active and Ayuda not", async () => {
  const services = createAppServices();
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/account");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  const configItem = screen.getByRole("link", { name: "Config" }).element() as HTMLAnchorElement;
  expect(configItem.getAttribute("aria-current")).toBe("page");
  const usersItem = screen.getByRole("link", { name: "Usuarios" }).element() as HTMLAnchorElement;
  expect(usersItem.getAttribute("aria-current")).toBe("page");
  await expect.poll(() => document.title).toBe("Mi cuenta · Puro Sur");

  const helpItemLocator = screen.getByRole("link", { name: "Ayuda" });
  await expect.element(helpItemLocator).toBeVisible();
  const helpItem = helpItemLocator.element() as HTMLAnchorElement;
  expect(helpItem.getAttribute("aria-current")).toBeNull();
});

test("following the account name link from Help shows Mi cuenta", async () => {
  const services = createAppServices();
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/help");
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByRole("link", { name: "Lucas Guardiola" }));

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/account");
});

test("following the sidebar's Usuarios item from Mi cuenta opens the Users list, with Mi cuenta still reachable from the account name", async () => {
  const services = createAppServices();
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/account");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();

  vi.mocked(services.usersListScreen.fetchUsers).mockResolvedValue({ kind: "ok", value: [] });
  await userEvent.click(screen.getByRole("link", { name: "Usuarios" }));

  await expect.element(screen.getByRole("heading", { name: "Usuarios", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/users");
  expect(services.usersListScreen.fetchUsers).toHaveBeenCalled();

  await userEvent.click(screen.getByRole("link", { name: "Lucas Guardiola" }));

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/account");
});

test("opens a user's detail screen at /users/:id, with Usuarios still the active sidebar item, and the browser's back button returns to the list", async () => {
  const services = createAppServices();
  const martina = {
    id: "user-2",
    firstName: "Martina Gómez",
    email: "martina@example.com",
    version: 1,
    role: { id: "role-admin", isAdministrator: true, name: null },
    passkeyCount: 1,
    isLastActiveAdministrator: false,
  };
  vi.mocked(services.usersListScreen.fetchUsers).mockResolvedValue({
    kind: "ok",
    value: [martina],
  });
  vi.mocked(services.userDetailScreen.fetchUser).mockResolvedValue({ kind: "ok", value: martina });
  vi.mocked(services.userDetailScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/users");
  window.history.pushState(null, "", "/users/user-2");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("heading", { name: "Martina Gómez", level: 1 }))
    .toBeVisible();
  const usersItem = screen.getByRole("link", { name: "Usuarios" }).element() as HTMLAnchorElement;
  expect(usersItem.getAttribute("aria-current")).toBe("page");

  window.history.back();

  await expect.element(screen.getByRole("heading", { name: "Usuarios", level: 1 })).toBeVisible();
});

test("passes the signed-in Administrator's own id to the user detail screen, hiding their own passkey's remove button", async () => {
  const services = createAppServices();
  const lucas = {
    id: "user-1",
    firstName: "Lucas Guardiola",
    email: "lucas@example.com",
    version: 1,
    role: { id: "role-admin", isAdministrator: true, name: null },
    passkeyCount: 1,
    isLastActiveAdministrator: true,
  };
  vi.mocked(services.userDetailScreen.fetchUser).mockResolvedValue({ kind: "ok", value: lucas });
  vi.mocked(services.userDetailScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.userDetailScreen.fetchUserPasskeys).mockResolvedValue({
    kind: "ok",
    value: [
      {
        id: "pk-1",
        name: "Notebook del local",
        createdAt: "2026-08-02T12:00:00.000Z",
        lastUsedAt: null,
      },
    ],
  });
  window.history.pushState(null, "", "/users/user-1");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Dar de baja la passkey «Notebook del local»" }).query(),
  ).toBeNull();
});

test("redirects a non-Administrator's typed /users to Mi cuenta, without listing users", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/users");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  expect(window.location.pathname).toBe("/account");
  expect(services.usersListScreen.fetchUsers).not.toHaveBeenCalled();
});

test("shows Mi cuenta's own sidebar entry instead of Usuarios for a non-Administrator", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
      ),
  });
  vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
  window.history.pushState(null, "", "/account");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 })).toBeVisible();
  const myAccountItem = screen
    .getByRole("link", { name: "Mi cuenta" })
    .element() as HTMLAnchorElement;
  expect(myAccountItem.getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "Usuarios" }).query()).toBeNull();
  expect(screen.getByRole("link", { name: "Roles" }).query()).toBeNull();
});

test("lets a non-Administrator holding deactivate_users open Usuarios, without Nuevo usuario", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: ["deactivate_users"],
      }),
    ),
  });
  vi.mocked(services.usersListScreen.fetchUsers).mockResolvedValue({
    kind: "ok",
    value: [
      {
        id: "user-3",
        firstName: "Tomás Ruiz",
        email: "tomas@example.com",
        version: 1,
        role: { id: "role-shift", isAdministrator: false, name: "Atención de caja" },
        passkeyCount: 0,
        isLastActiveAdministrator: false,
      },
    ],
  });
  vi.mocked(services.usersListScreen.fetchRoles).mockResolvedValue({ kind: "forbidden" });
  window.history.pushState(null, "", "/users");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Usuarios", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  expect(screen.getByRole("button", { name: "Nuevo usuario" }).query()).toBeNull();
  expect(services.usersListScreen.fetchRoles).not.toHaveBeenCalled();
  expect(window.location.pathname).toBe("/users");
  window.history.pushState(null, "", "/");
});

test("opens a user's detail for a non-Administrator holding deactivate_users, offering only Desactivar", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: ["deactivate_users"],
      }),
    ),
  });
  vi.mocked(services.userDetailScreen.fetchUser).mockResolvedValue({
    kind: "ok",
    value: {
      id: "user-3",
      firstName: "Tomás Ruiz",
      email: "tomas@example.com",
      version: 1,
      role: { id: "role-shift", isAdministrator: false, name: "Atención de caja" },
      passkeyCount: 0,
      isLastActiveAdministrator: false,
    },
  });
  vi.mocked(services.userDetailScreen.fetchUserPasskeys).mockResolvedValue({ kind: "forbidden" });
  window.history.pushState(null, "", "/users/user-3");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Tomás Ruiz", level: 1 })).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Desactivar a Tomás Ruiz" }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Editar" }).query()).toBeNull();
  expect(services.userDetailScreen.fetchUserPasskeys).not.toHaveBeenCalled();
  expect(window.location.pathname).toBe("/users/user-3");
  window.history.pushState(null, "", "/");
});

test("lets a non-Administrator holding only reset_user_pin open Usuarios and a user's detail, offering the PIN reset", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Hopper",
        isAdministrator: false,
        permissions: ["reset_user_pin"],
      }),
    ),
  });
  vi.mocked(services.userDetailScreen.fetchUser).mockResolvedValue({
    kind: "ok",
    value: {
      id: "user-3",
      firstName: "Tomás Ruiz",
      email: "tomas@example.com",
      version: 1,
      role: { id: "role-shift", isAdministrator: false, name: "Atención de caja" },
      passkeyCount: 0,
      isLastActiveAdministrator: false,
    },
  });
  vi.mocked(services.userDetailScreen.fetchUserPasskeys).mockResolvedValue({ kind: "forbidden" });
  window.history.pushState(null, "", "/users/user-3");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Tomás Ruiz", level: 1 })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reiniciar el PIN" })).toBeVisible();
  await expect.element(screen.getByRole("link", { name: "Usuarios" })).toBeVisible();
  expect(window.location.pathname).toBe("/users/user-3");
  window.history.pushState(null, "", "/");
});

test.each([
  {
    path: "/users/user-3",
    adminOnlyCalls: (services: AppServices) => [
      services.userDetailScreen.fetchUser,
      services.userDetailScreen.fetchUserPasskeys,
    ],
  },
])(
  "redirects a non-Administrator's typed $path to Mi cuenta, without calling its API",
  async ({ path, adminOnlyCalls }) => {
    const services = createAppServices({
      fetchSession: vi
        .fn()
        .mockResolvedValue(
          openSession({ userId: "user-2", displayName: "Grace Hopper", isAdministrator: false }),
        ),
    });
    vi.mocked(services.myAccountScreen.fetchPasskeys).mockResolvedValue({ kind: "ok", value: [] });
    window.history.pushState(null, "", path);

    const screen = await render(<App help={emptyHelp} services={services} />);

    await expect
      .element(screen.getByRole("heading", { name: "Mi cuenta", level: 1 }))
      .toBeVisible();
    expect(window.location.pathname).toBe("/account");
    for (const call of adminOnlyCalls(services)) {
      expect(call).not.toHaveBeenCalled();
    }
  },
);
