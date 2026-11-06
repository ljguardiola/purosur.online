import type { Capability } from "@purosur/domain";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { openSession } from "../sessions/test-support/open-session";
import { App, type AppServices } from "./app";
import { emptyHelp, resetPageState } from "./test-support/app";
import { createAppServices } from "./test-support/app-services";
import { opensOnlyScreens } from "./test-support/screen-routes";

opensOnlyScreens(["/", "/people/users"]);

beforeEach(resetPageState);

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

function servicesListing(
  user: typeof lucas | typeof sofia,
  capabilities?: Capability[],
): AppServices {
  const services = createAppServices(
    capabilities === undefined
      ? {}
      : {
          fetchSession: vi.fn().mockResolvedValue(
            openSession({
              userId: "user-2",
              displayName: "Grace Villalba",
              isAdministrator: false,
              capabilities,
            }),
          ),
        },
  );
  vi.mocked(services.usersListScreen.fetchUsers).mockResolvedValue({ kind: "ok", value: [user] });
  vi.mocked(services.usersListScreen.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });
  vi.mocked(services.userDetailScreen.fetchUser).mockResolvedValue({ kind: "ok", value: user });
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
  return services;
}

test("hides the remove button of the signed-in Administrator's own passkey in their panel", async () => {
  window.history.pushState(null, "", "/people/users?user=user-1&tab=credentials");
  const services = servicesListing(lucas);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Dar de baja la passkey «Notebook del local»" }).query(),
  ).toBeNull();
});

test("editing a user from its panel reads the user again but not its passkeys", async () => {
  window.history.pushState(null, "", "/people/users?user=user-5");
  const services = servicesListing({ ...sofia, mayEdit: true });
  vi.mocked(services.userDetailScreen.fetchUser)
    .mockResolvedValueOnce({ kind: "ok", value: { ...sofia, mayEdit: true } })
    .mockResolvedValue({
      kind: "ok",
      value: { ...sofia, mayEdit: true, email: "sofia.diaz@example.com", version: 2 },
    });
  vi.mocked(services.userDetailScreen.editUser).mockResolvedValue({ kind: "ok" });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  const dialog = screen.getByRole("dialog", { name: "Sofía Díaz" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "sofia.diaz@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(screen.getByText("sofia.diaz@example.com")).toBeVisible();
  expect(services.userCredentialSections.fetchUserPasskeys).not.toHaveBeenCalled();
});

test("deactivating a user its panel finds already gone reads the user again", async () => {
  window.history.pushState(null, "", "/people/users?user=user-5&tab=status");
  const services = servicesListing({ ...sofia, mayDeactivate: true });
  vi.mocked(services.userDetailScreen.fetchUser)
    .mockResolvedValueOnce({ kind: "ok", value: { ...sofia, mayDeactivate: true } })
    .mockResolvedValue({ kind: "not_found" });
  vi.mocked(services.userDetailScreen.deactivateUser).mockResolvedValue({ kind: "not_found" });
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByRole("button", { name: "Desactivar a Sofía Díaz" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "¿Desactivar a Sofía Díaz?" })
      .getByRole("button", { name: "Desactivar" }),
  );

  await expect
    .element(screen.getByRole("complementary", { name: "Usuario" }).getByRole("alert"))
    .toHaveTextContent("No encontramos este usuario");
});

test("deactivating a user closes its panel, removing it from the URL", async () => {
  window.history.pushState(null, "", "/people/users?user=user-5&tab=status");
  const services = servicesListing({ ...sofia, mayDeactivate: true });
  vi.mocked(services.userDetailScreen.deactivateUser).mockResolvedValue({ kind: "ok" });
  const screen = await render(<App help={emptyHelp} services={services} />);

  await userEvent.click(screen.getByRole("button", { name: "Desactivar a Sofía Díaz" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "¿Desactivar a Sofía Díaz?" })
      .getByRole("button", { name: "Desactivar" }),
  );

  await expect
    .element(screen.getByRole("complementary", { name: "Sofía Díaz" }))
    .not.toBeInTheDocument();
  expect(window.location.pathname + window.location.search).toBe("/people/users");
});

test("reactivating a user from its panel reads the user again", async () => {
  window.history.pushState(null, "", "/people/users?user=user-5&tab=status");
  const inactive = { ...sofia, active: false, mayReactivate: true };
  const services = servicesListing(inactive);
  vi.mocked(services.userDetailScreen.fetchUser)
    .mockResolvedValueOnce({ kind: "ok", value: inactive })
    .mockResolvedValue({ kind: "ok", value: sofia });
  vi.mocked(services.userDetailScreen.reactivateUser).mockResolvedValue({ kind: "ok" });
  const screen = await render(<App help={emptyHelp} services={services} />);
  await expect.element(screen.getByText("Inactivo", { exact: true }).last()).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reactivar a Sofía Díaz" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "¿Reactivar a Sofía Díaz?" })
      .getByRole("button", { name: "Reactivar" }),
  );

  await expect.element(screen.getByText("Activo", { exact: true })).toBeVisible();
});

test("sends a person without users_area who opens Personas' users to the own account panel, without listing users", async () => {
  window.history.pushState(null, "", "/people/users?user=user-5");
  const services = servicesListing(sofia, []);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("tab", { name: "Passkeys y PIN" })).toBeVisible();
  expect(window.location.pathname + window.location.search).toBe("/?account=credentials");
  expect(services.usersListScreen.fetchUsers).not.toHaveBeenCalled();
  expect(services.userDetailScreen.fetchUser).not.toHaveBeenCalled();
});

test("lets a person holding deactivate_users open Usuarios and a user's panel, without Nuevo usuario or Editar", async () => {
  window.history.pushState(null, "", "/people/users?user=user-5&tab=status");
  const services = servicesListing({ ...sofia, mayDeactivate: true }, [
    "users_area",
    "deactivate_users",
  ]);
  vi.mocked(services.usersListScreen.fetchRoles).mockResolvedValue({ kind: "forbidden" });

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect
    .element(screen.getByRole("button", { name: "Desactivar a Sofía Díaz" }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Nuevo usuario" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Editar" }).query()).toBeNull();
  expect(services.usersListScreen.fetchRoles).not.toHaveBeenCalled();
  expect(services.userCredentialSections.fetchUserPasskeys).not.toHaveBeenCalled();
});

test("lets a person holding only reset_user_pin open a user's panel, offering the PIN reset", async () => {
  window.history.pushState(null, "", "/people/users?user=user-5&tab=credentials");
  const services = servicesListing({ ...sofia, mayEmitPinCode: true }, [
    "users_area",
    "reset_user_pin",
  ]);

  const screen = await render(<App help={emptyHelp} services={services} />);

  await expect.element(screen.getByRole("button", { name: "Reiniciar el PIN" })).toBeVisible();
});
