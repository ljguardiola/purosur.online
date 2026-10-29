import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { BranchUser } from "../platform/branch-users-api";
import { ADMINISTRATOR_ACCESS, accessWith } from "../shell/test-support/backoffice-access";
import { createUsersListServices, renderUsersList } from "./test-support/users-list-screen";

const administrator: BranchUser = {
  id: "user-1",
  firstName: "Lucas Medrano",
  email: "lucas@example.com",
  version: 1,
  role: { id: "00000000-0000-4000-8000-000000000001", isAdministrator: true, name: null },
  passkeyCount: 2,
  isLastActiveAdministrator: true,
  mayEmitPinCode: true,
  mayEdit: true,
  mayDeactivate: false,
  mayReactivate: false,
  mayRemovePasskey: true,
};

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

async function openNewUserModal(access: Parameters<typeof renderUsersList>[2]) {
  const services = createUsersListServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderUsersList(services, () => {}, access);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
  const dialog = screen.getByRole("dialog", { name: "Nuevo usuario" });
  await expect.element(dialog.getByRole("combobox", { name: /^Rol/ })).toBeVisible();
  return { screen, dialog };
}

test("typing a role that does not exist offers to create it, opening the role form with the typed text", async () => {
  const { screen, dialog } = await openNewUserModal(ADMINISTRATOR_ACCESS);

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Rol/ }), "Encargado de depósito");
  await userEvent.click(page.getByRole("option", { name: "Crear rol «Encargado de depósito»" }));

  await expect
    .element(
      screen
        .getByRole("dialog", { name: "Nuevo rol" })
        .getByText("Nombre tipeado: Encargado de depósito"),
    )
    .toBeVisible();
});

test("saving the created role selects it and keeps the rest of the new user as typed", async () => {
  const { screen, dialog } = await openNewUserModal(ADMINISTRATOR_ACCESS);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("combobox", { name: /^Rol/ }), "Encargado de depósito");
  await userEvent.click(page.getByRole("option", { name: "Crear rol «Encargado de depósito»" }));

  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Nuevo rol" })
      .getByRole("button", { name: "Guardar lo creado" }),
  );

  await expect.poll(() => screen.getByRole("dialog", { name: "Nuevo rol" }).query()).toBeNull();
  await expect
    .element(dialog.getByRole("combobox", { name: /^Rol/ }))
    .toHaveValue("Encargado de depósito");
  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Martina Gómez");
});

test("offers no role creation to a person who cannot manage roles", async () => {
  const { dialog } = await openNewUserModal(accessWith("users_area", "manage_users"));

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Rol/ }), "Encargado de depósito");

  await expect.element(page.getByText("Sin resultados")).toBeVisible();
  expect(page.getByRole("option", { name: /^Crear rol/ }).query()).toBeNull();
});
