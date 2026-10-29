import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { RoleSummary } from "../platform/roles-api";
import { permissionCatalogFixture } from "../platform/test-support/permission-catalog";
import { render } from "../shell/test-support/render-with-router";
import { RoleCreationModal } from "./role-creation-modal";
import type { RoleEditorModalServices } from "./role-editor-modal";

beforeEach(async () => {
  await page.viewport(1280, 900);
});

const storeRole: RoleSummary = {
  id: "role-store",
  name: "Depósito",
  isAdministrator: false,
  permissionKeys: [],
  userCount: 0,
  mayEdit: true,
};

function createServices(): RoleEditorModalServices {
  return {
    fetchRole: vi.fn(),
    fetchPermissionCatalog: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: permissionCatalogFixture }),
    createRole: vi.fn().mockResolvedValue({ kind: "ok", role: storeRole }),
    editRole: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
  };
}

function renderPart(
  services: RoleEditorModalServices,
  options: { open?: boolean; onCreated?: (role: RoleSummary) => void } = {},
) {
  return render(
    <main>
      <RoleCreationModal
        open={options.open ?? true}
        initialName="Depósito"
        onCreated={options.onCreated ?? (() => {})}
        onClose={() => {}}
        onSessionEnded={() => {}}
        services={services}
      />
    </main>,
  );
}

test("shows nothing while closed", async () => {
  const services = createServices();
  const screen = await renderPart(services, { open: false });

  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(services.fetchPermissionCatalog).not.toHaveBeenCalled();
});

test("opens the new role editor with the typed name", async () => {
  const screen = await renderPart(createServices());

  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
});

test("hands back the role it created", async () => {
  const services = createServices();
  const onCreated = vi.fn();
  const screen = await renderPart(services, { onCreated });

  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.poll(() => onCreated.mock.calls.length).toBe(1);
  expect(onCreated).toHaveBeenCalledWith(storeRole);
});
