import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../sessions/test-support/open-session";
import { App, type AppServices } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/account", "/help", "/users", "/users/$userId"]);

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

  await userEvent.click(screen.getByRole("link", { name: "Lucas Medrano" }));

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

  await userEvent.click(screen.getByRole("link", { name: "Lucas Medrano" }));

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
    mayEmitPinCode: true,
    mayEdit: true,
    mayDeactivate: false,
    mayReactivate: false,
    mayRemovePasskey: true,
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
    firstName: "Lucas Medrano",
    email: "lucas@example.com",
    version: 1,
    role: { id: "role-admin", isAdministrator: true, name: null },
    passkeyCount: 1,
    isLastActiveAdministrator: true,
    mayEmitPinCode: true,
    mayEdit: true,
    mayDeactivate: false,
    mayReactivate: false,
    mayRemovePasskey: false,
  };
  vi.mocked(services.userDetailScreen.fetchUser).mockResolvedValue({ kind: "ok", value: lucas });
  vi.mocked(services.userDetailScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.userCredentialSections.fetchUserPasskeys).mockResolvedValue({
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

const sofia = {
  id: "user-5",
  firstName: "Sofía Díaz",
  email: "sofia@example.com",
  version: 1,
  active: true,
  role: {
    id: "00000000-0000-4000-8000-000000000002",
    isAdministrator: false,
    name: "Atención de caja",
  },
  passkeyCount: 1,
  isLastActiveAdministrator: false,
  mayEmitPinCode: false,
  mayEdit: false,
  mayDeactivate: false,
  mayReactivate: false,
  mayRemovePasskey: false,
};

async function renderSofiaWithHerPasskey(services: AppServices) {
  vi.mocked(services.userDetailScreen.fetchRoles).mockResolvedValue({
    kind: "ok",
    value: [
      {
        id: "00000000-0000-4000-8000-000000000002",
        name: "Atención de caja",
        isAdministrator: false,
        permissionKeys: [],
        userCount: 1,
        mayEdit: true,
      },
    ],
  });
  vi.mocked(services.userCredentialSections.fetchUserPasskeys).mockResolvedValue({
    kind: "ok",
    value: [
      {
        id: "pk-1",
        name: "Teléfono de Sofía",
        createdAt: "2026-08-02T12:00:00.000Z",
        lastUsedAt: null,
      },
    ],
  });
  window.history.pushState(null, "", "/users/user-5");
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("Teléfono de Sofía")).toBeVisible();
  return screen;
}

test("editing a user from its detail reads the user again but not its passkeys", async () => {
  const services = createAppServices();
  vi.mocked(services.userDetailScreen.fetchUser)
    .mockResolvedValueOnce({ kind: "ok", value: { ...sofia, mayEdit: true } })
    .mockResolvedValue({
      kind: "ok",
      value: { ...sofia, mayEdit: true, email: "sofia.diaz@example.com", version: 2 },
    });
  vi.mocked(services.userDetailScreen.editUser).mockResolvedValue({ kind: "ok" });
  const screen = await renderSofiaWithHerPasskey(services);

  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog", { name: "Sofía Díaz" });
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "sofia.diaz@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(screen.getByText("sofia.diaz@example.com")).toBeVisible();
  expect(services.userCredentialSections.fetchUserPasskeys).toHaveBeenCalledTimes(1);
});

test("deactivating a user its detail finds already gone reads the user again but not its passkeys", async () => {
  const services = createAppServices();
  vi.mocked(services.userDetailScreen.fetchUser)
    .mockResolvedValueOnce({ kind: "ok", value: { ...sofia, mayDeactivate: true } })
    .mockResolvedValue({ kind: "not_found" });
  vi.mocked(services.userDetailScreen.deactivateUser).mockResolvedValue({ kind: "not_found" });
  const screen = await renderSofiaWithHerPasskey(services);

  await userEvent.click(screen.getByRole("button", { name: "Desactivar a Sofía Díaz" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "¿Desactivar a Sofía Díaz?" })
      .getByRole("button", { name: "Desactivar" }),
  );

  await expect.element(screen.getByRole("alert")).toHaveTextContent("No encontramos este usuario");
  expect(services.userCredentialSections.fetchUserPasskeys).toHaveBeenCalledTimes(1);
});

test("reactivating a user from its detail reads the user again but not its passkeys", async () => {
  const services = createAppServices();
  vi.mocked(services.userDetailScreen.fetchUser)
    .mockResolvedValueOnce({ kind: "ok", value: { ...sofia, active: false, mayReactivate: true } })
    .mockResolvedValue({ kind: "ok", value: sofia });
  vi.mocked(services.userDetailScreen.reactivateUser).mockResolvedValue({ kind: "ok" });
  const screen = await renderSofiaWithHerPasskey(services);

  await userEvent.click(screen.getByRole("button", { name: "Reactivar a Sofía Díaz" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "¿Reactivar a Sofía Díaz?" })
      .getByRole("button", { name: "Reactivar" }),
  );

  await expect.element(screen.getByText("Inactivo")).not.toBeInTheDocument();
  expect(services.userCredentialSections.fetchUserPasskeys).toHaveBeenCalledTimes(1);
});

test("redirects a non-Administrator's typed /users to Mi cuenta, without listing users", async () => {
  const services = createAppServices({
    fetchSession: vi
      .fn()
      .mockResolvedValue(
        openSession({ userId: "user-2", displayName: "Grace Villalba", isAdministrator: false }),
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
        openSession({ userId: "user-2", displayName: "Grace Villalba", isAdministrator: false }),
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
        displayName: "Grace Villalba",
        isAdministrator: false,
        capabilities: ["users_area", "deactivate_users"],
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
        mayEmitPinCode: true,
        mayEdit: true,
        mayDeactivate: true,
        mayReactivate: false,
        mayRemovePasskey: true,
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
        displayName: "Grace Villalba",
        isAdministrator: false,
        capabilities: ["users_area", "deactivate_users"],
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
      mayEmitPinCode: true,
      mayEdit: false,
      mayDeactivate: true,
      mayReactivate: false,
      mayRemovePasskey: false,
    },
  });
  vi.mocked(services.userCredentialSections.fetchUserPasskeys).mockResolvedValue({
    kind: "forbidden",
  });
  window.history.pushState(null, "", "/users/user-3");

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("heading", { name: "Tomás Ruiz", level: 1 })).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Desactivar a Tomás Ruiz" }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Editar" }).query()).toBeNull();
  expect(services.userCredentialSections.fetchUserPasskeys).not.toHaveBeenCalled();
  expect(window.location.pathname).toBe("/users/user-3");
  window.history.pushState(null, "", "/");
});

test("lets a non-Administrator holding only reset_user_pin open Usuarios and a user's detail, offering the PIN reset", async () => {
  const services = createAppServices({
    fetchSession: vi.fn().mockResolvedValue(
      openSession({
        userId: "user-2",
        displayName: "Grace Villalba",
        isAdministrator: false,
        capabilities: ["users_area", "reset_user_pin"],
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
      mayEmitPinCode: true,
      mayEdit: true,
      mayDeactivate: true,
      mayReactivate: false,
      mayRemovePasskey: true,
    },
  });
  vi.mocked(services.userCredentialSections.fetchUserPasskeys).mockResolvedValue({
    kind: "forbidden",
  });
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
      services.userCredentialSections.fetchUserPasskeys,
    ],
  },
])(
  "redirects a non-Administrator's typed $path to Mi cuenta, without calling its API",
  async ({ path, adminOnlyCalls }) => {
    const services = createAppServices({
      fetchSession: vi
        .fn()
        .mockResolvedValue(
          openSession({ userId: "user-2", displayName: "Grace Villalba", isAdministrator: false }),
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
