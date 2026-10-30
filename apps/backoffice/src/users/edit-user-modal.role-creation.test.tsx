import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { BranchUser } from "../platform/branch-users-api";
import type { RoleSummary } from "../platform/roles-api";
import { StubRoleCreationModal } from "../platform/test-support/creation-parts";
import { render } from "../shell/test-support/render-with-router";
import { EditUserModal } from "./edit-user-modal";

const shiftRole: RoleSummary = {
  id: "00000000-0000-4000-8000-000000000002",
  isAdministrator: false,
  name: "Responsable de turno",
  permissionKeys: [],
  userCount: 1,
  mayEdit: true,
};

const lucia: BranchUser = {
  id: "user-1",
  firstName: "Lucía",
  email: "lucia.perez@example.com",
  version: 1,
  role: shiftRole,
  passkeyCount: 1,
  isLastActiveAdministrator: false,
  mayEmitPinCode: true,
  mayEdit: true,
  mayDeactivate: true,
  mayReactivate: false,
  mayRemovePasskey: true,
};

async function opened(withCreation: boolean) {
  const screen = await render(
    <main>
      <EditUserModal
        open
        user={lucia}
        roles={[shiftRole]}
        {...(withCreation ? { roleCreationModal: StubRoleCreationModal } : {})}
        onClose={() => {}}
        onSaved={() => {}}
        onSessionEnded={() => {}}
        reload={vi.fn()}
        services={{
          editUser: vi.fn(),
          fetchSessionAuthorizationOptions: vi.fn(),
          authorizeSession: vi.fn(),
          startAuthentication: vi.fn(),
        }}
      />
    </main>,
  );
  const dialog = screen.getByRole("dialog", { name: "Lucía" });
  await expect.element(dialog.getByRole("combobox", { name: /^Rol/ })).toBeVisible();
  return { screen, dialog };
}

test("typing a role that does not exist offers to create it and selects it once saved, keeping the email as typed", async () => {
  const { screen, dialog } = await opened(true);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@example.com");
  await userEvent.fill(dialog.getByRole("combobox", { name: /^Rol/ }), "Cajero de tarde");

  await userEvent.click(page.getByRole("option", { name: "Crear rol «Cajero de tarde»" }));
  const creation = screen.getByRole("dialog", { name: "Nuevo rol" });
  await expect.element(creation.getByText("Nombre tipeado: Cajero de tarde")).toBeVisible();
  await userEvent.click(creation.getByRole("button", { name: "Guardar lo creado" }));

  await expect.poll(() => screen.getByRole("dialog", { name: "Nuevo rol" }).query()).toBeNull();
  await expect
    .element(dialog.getByRole("combobox", { name: /^Rol/ }))
    .toHaveValue("Cajero de tarde");
  await expect
    .element(dialog.getByRole("textbox", { name: /^Correo/ }))
    .toHaveValue("nueva@example.com");
});

test("offers no role creation when the modal is given no way to create one", async () => {
  const { dialog } = await opened(false);

  await userEvent.fill(dialog.getByRole("combobox", { name: /^Rol/ }), "Cajero de tarde");

  await expect.element(page.getByText("Sin resultados")).toBeVisible();
  expect(page.getByRole("option", { name: /^Crear rol/ }).query()).toBeNull();
});
