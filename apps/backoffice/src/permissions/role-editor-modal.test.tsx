import type { PermissionCatalogWire } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { type ReactElement, useEffect } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { useRefreshAccess } from "../platform/access-queries";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import type { RoleSummary } from "../platform/roles-api";
import { permissionCatalogFixture } from "../platform/test-support/permission-catalog";
import { render } from "../shell/test-support/render-with-router";
import {
  RoleEditorModal,
  type RoleEditorModalServices,
  type RoleEditorRequest,
} from "./role-editor-modal";
import type { CreateRoleOutcome, EditRoleOutcome, FetchRoleOutcome, RoleDetail } from "./roles-api";

// The editor modal is 1040px wide, wider than browser mode's phone-sized default viewport,
// which would leave its footer's save button unclickable.
beforeEach(async () => {
  await page.viewport(1280, 900);
});

function createServices(overrides: Partial<RoleEditorModalServices> = {}): RoleEditorModalServices {
  return {
    fetchRole: vi.fn().mockReturnValue(new Promise(() => {})),
    fetchPermissionCatalog: vi
      .fn()
      .mockResolvedValue({ kind: "ok", value: permissionCatalogFixture }),
    createRole: vi.fn(),
    editRole: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

function grantAuthorization(services: RoleEditorModalServices) {
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
}

const stockDetail: RoleDetail = {
  id: "role-stock",
  name: "Depósito",
  isAdministrator: false,
  permissionKeys: ["view_stock_balances"],
  userCount: 0,
  mayEdit: true,
  version: 3,
  assignedUsers: [],
};

const stockDetailWithPeople: RoleDetail = {
  ...stockDetail,
  userCount: 2,
  mayEdit: true,
  assignedUsers: [
    { id: "user-amara", name: "Amara Ortiz" },
    { id: "user-zoe", name: "Zoe Almeida" },
  ],
};

const stockSummary: RoleSummary = {
  id: "role-stock",
  name: "Depósito",
  isAdministrator: false,
  permissionKeys: ["sell_and_charge", "view_all_alerts"],
  userCount: 0,
  mayEdit: true,
};

function renderModal(
  request: RoleEditorRequest | null,
  services: RoleEditorModalServices,
  handlers: { onClose?: () => void; onSaved?: () => void; onSessionEnded?: () => void } = {},
) {
  return render(
    <main>
      <RoleEditorModal
        request={request}
        onClose={handlers.onClose ?? (() => {})}
        onSaved={handlers.onSaved ?? (() => {})}
        onSessionEnded={handlers.onSessionEnded ?? (() => {})}
        services={services}
      />
    </main>,
  );
}

test("renders nothing when there is no request", async () => {
  const services = createServices();
  const screen = await renderModal(null, services);

  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("opening for a new role shows the empty form, the eyebrow, and the create save label", async () => {
  const services = createServices();
  const screen = await renderModal({ kind: "new" }, services);

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("Configuración · Roles")).toBeVisible();
  await expect.element(dialog.getByText("Nuevo rol")).toBeVisible();
  await expect.element(screen.getByRole("textbox", { name: /^Nombre del rol/ })).toHaveValue("");
  await expect.element(screen.getByText("0 permisos elegidos")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Guardar el rol" })).toBeVisible();
});

test("a new role's editor shows the loading placeholder, with saving disabled, until the permission catalog loads", async () => {
  const catalog = deferred<CloudReadOutcome<PermissionCatalogWire>>();
  const services = createServices({
    fetchPermissionCatalog: vi.fn().mockReturnValue(catalog.promise),
  });
  const screen = await renderModal({ kind: "new" }, services);

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  await expect.element(screen.getByRole("button", { name: "Guardar el rol" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled();

  catalog.resolve({ kind: "ok", value: permissionCatalogFixture });
  await expect.element(screen.getByRole("textbox", { name: /^Nombre del rol/ })).toHaveValue("");
});

test("a permission catalog that fails to load keeps saving disabled, and Reintentar opens the duplicate pre-filled", async () => {
  const services = createServices({
    fetchPermissionCatalog: vi
      .fn()
      .mockResolvedValueOnce({ kind: "failed" })
      .mockResolvedValueOnce({ kind: "ok", value: permissionCatalogFixture }),
  });
  const screen = await renderModal({ kind: "duplicate", source: stockSummary }, services);
  await expect.element(screen.getByText("No pudimos abrir este rol")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Guardar el rol" })).toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Copia de Depósito");
});

test("editing a role waits for the permission catalog as well as the role, and reads each once", async () => {
  const catalog = deferred<CloudReadOutcome<PermissionCatalogWire>>();
  const services = createServices({
    fetchPermissionCatalog: vi.fn().mockReturnValue(catalog.promise),
  });
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stockDetail });
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services);

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");

  catalog.resolve({ kind: "ok", value: permissionCatalogFixture });
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  expect(services.fetchRole).toHaveBeenCalledTimes(1);
  expect(services.fetchPermissionCatalog).toHaveBeenCalledTimes(1);
});

test("a permission catalog that fails to load while editing shows the failure, and Reintentar opens the role", async () => {
  const services = createServices({
    fetchPermissionCatalog: vi
      .fn()
      .mockResolvedValueOnce({ kind: "failed" })
      .mockResolvedValueOnce({ kind: "ok", value: permissionCatalogFixture }),
  });
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stockDetail });
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services);
  await expect.element(screen.getByText("No pudimos abrir este rol")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Guardar los cambios" })).toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
});

test("draws the name row and both panes flush to the panel's own edges, not inset by Modal's default body padding", async () => {
  const services = createServices();
  const screen = await renderModal({ kind: "new" }, services);
  await expect.element(screen.getByRole("textbox", { name: /^Nombre del rol/ })).toBeVisible();
  const dialog = screen.getByRole("dialog").element() as HTMLElement;
  const panel = dialog.parentElement as HTMLElement;
  const panelRect = panel.getBoundingClientRect();

  const nameRow = (
    screen.getByRole("textbox", { name: /^Nombre del rol/ }).element() as HTMLElement
  ).closest("div[class*='border-b']") as HTMLElement;
  const areasPane = screen.getByRole("button", { name: /^Caja/ }).element()
    .parentElement as HTMLElement;

  const nameRowRect = nameRow.getBoundingClientRect();
  const areasPaneRect = areasPane.getBoundingClientRect();

  expect(nameRowRect.left).toBeCloseTo(panelRect.left, 0);
  expect(nameRowRect.right).toBeCloseTo(panelRect.right, 0);
  expect(areasPaneRect.left).toBeCloseTo(panelRect.left, 0);
  expect(areasPaneRect.top).toBeCloseTo(nameRowRect.bottom, 0);

  await expectNoAccessibilityViolations(document.body);
});

test("opening to duplicate pre-fills the name and every permission from the row already on hand, without fetching", async () => {
  const services = createServices();
  const screen = await renderModal({ kind: "duplicate", source: stockSummary }, services);

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("Duplicar rol")).toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Copia de Depósito");
  await expect.element(screen.getByText("2 permisos elegidos")).toBeVisible();
  expect(services.fetchRole).not.toHaveBeenCalled();
});

test("opening to duplicate the Administrator role pre-fills the name from the Administrator's display name", async () => {
  const services = createServices();
  const administratorSummary: RoleSummary = {
    id: "role-administrator",
    name: null,
    isAdministrator: true,
    permissionKeys: [],
    userCount: 1,
    mayEdit: false,
  };
  const screen = await renderModal({ kind: "duplicate", source: administratorSummary }, services);

  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Copia de Administrador");
});

test("opening to edit fetches the role fresh and pre-fills it, with the edit save label", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stockDetail });
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services);

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByText("Editar rol")).toBeVisible();
  expect(services.fetchRole).toHaveBeenCalledWith("role-stock");
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  await expect.element(screen.getByText("1 permiso elegido")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Guardar los cambios" })).toBeVisible();
});

test("shows not-found for an edit target that no longer exists", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "not_found" });

  const screen = await renderModal({ kind: "edit", roleId: "role-gone" }, services);

  await expect.element(screen.getByText("No encontramos este rol").first()).toBeVisible();
});

test("shows a load error with retry when the role fails to load, and retry fetches again", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services);
  await expect.element(screen.getByText("No pudimos abrir este rol")).toBeVisible();

  vi.mocked(services.fetchRole).mockResolvedValueOnce({ kind: "ok", value: stockDetail });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
});

test("Cancelar closes without calling the API", async () => {
  const services = createServices();
  const onClose = vi.fn();
  const screen = await renderModal({ kind: "new" }, services, { onClose });

  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(services.createRole).not.toHaveBeenCalled();
});

test("requires a non-empty name, without calling the API", async () => {
  const services = createServices();
  const screen = await renderModal({ kind: "new" }, services);

  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.element(screen.getByText("Ingresá el nombre del rol.")).toBeVisible();
  expect(services.createRole).not.toHaveBeenCalled();
});

test("rejects the Administrator role's own name, without calling the API", async () => {
  const services = createServices();
  const screen = await renderModal({ kind: "new" }, services);

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "administrador");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect
    .element(screen.getByText("Ese nombre es del Administrador; elegí otro."))
    .toBeVisible();
  expect(services.createRole).not.toHaveBeenCalled();
});

test("rejects a name over 100 characters once trimmed, without calling the API", async () => {
  const services = createServices();
  const screen = await renderModal({ kind: "new" }, services);

  await userEvent.fill(
    screen.getByRole("textbox", { name: /^Nombre del rol/ }),
    `  ${"a".repeat(101)}  `,
  );
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect
    .element(screen.getByText("El nombre puede tener hasta 100 caracteres."))
    .toBeVisible();
  expect(services.createRole).not.toHaveBeenCalled();
});

test("shows the name the cloud refused on Nombre del rol", async () => {
  const services = createServices();
  vi.mocked(services.createRole).mockResolvedValue({ kind: "validation_failed", field: "name" });
  const screen = await renderModal({ kind: "new" }, services);

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.element(screen.getByText("Revisá el nombre del rol.")).toBeVisible();
  expect(screen.getByText("No se pudo guardar el rol").query()).toBeNull();
});

test("shows the generic failure notice when the cloud refuses a field the form does not have", async () => {
  const services = createServices();
  vi.mocked(services.createRole).mockResolvedValue({
    kind: "validation_failed",
    field: "permissions",
  });
  const screen = await renderModal({ kind: "new" }, services);

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.element(screen.getByText("No se pudo guardar el rol")).toBeVisible();
});

test("creates the role directly, without the authorization modal, when the session already has one", async () => {
  const services = createServices();
  vi.mocked(services.createRole).mockResolvedValue({ kind: "ok" });
  const onSaved = vi.fn();
  const screen = await renderModal({ kind: "new" }, services, { onSaved });

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: /^Stock/ }));
  await userEvent.click(screen.getByText("Ver saldos").element());
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.poll(() => vi.mocked(services.createRole).mock.calls.length).toBe(1);
  expect(services.createRole).toHaveBeenCalledWith({
    name: "Depósito",
    permissions: ["view_stock_balances"],
  });
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
});

test("opens the nested authorization modal on authorization_required, then authorizes and retries the save", async () => {
  const services = createServices();
  vi.mocked(services.createRole).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.createRole).mockResolvedValueOnce({ kind: "ok" });
  const onSaved = vi.fn();
  const screen = await renderModal({ kind: "new" }, services, { onSaved });

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.element(screen.getByRole("heading", { name: "Autorizá este cambio" })).toBeVisible();
  await expect
    .element(
      screen.getByText("Guardar un rol necesita tu autorización. Confirmala con tu passkey."),
    )
    .toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.createRole).mock.calls.length).toBe(2);
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
});

test("shows name_taken as a field error and keeps the modal open", async () => {
  const services = createServices();
  vi.mocked(services.createRole).mockResolvedValue({ kind: "name_taken" });
  const onClose = vi.fn();
  const screen = await renderModal({ kind: "new" }, services, { onClose });

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.element(screen.getByText("Ya existe un rol con este nombre.")).toBeVisible();
  expect(onClose).not.toHaveBeenCalled();
});

test("ends the session when saving finds it already ended", async () => {
  const services = createServices();
  vi.mocked(services.createRole).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderModal({ kind: "new" }, services, { onSessionEnded });

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("edits the role with its id, name, permissions, and the version it was loaded with", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stockDetail });
  vi.mocked(services.editRole).mockResolvedValue({ kind: "ok" });
  const onSaved = vi.fn();
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services, { onSaved });
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");

  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editRole).mock.calls.length).toBe(1);
  expect(services.editRole).toHaveBeenCalledWith("role-stock", {
    name: "Depósito",
    permissions: ["view_stock_balances"],
    version: 3,
  });
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
});

test("editing a role saved without a permission one of its permissions requires adds it, shown as required", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({
    kind: "ok",
    value: { ...stockDetail, permissionKeys: ["adjust_stock"] },
  });
  vi.mocked(services.editRole).mockResolvedValue({ kind: "ok" });
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services);
  await expect.element(screen.getByText("2 permisos elegidos")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /^Stock/ }));
  const balances = screen.getByRole("checkbox", { name: "Ver saldos" });
  await expect.element(balances).toBeChecked();
  await expect.element(balances).toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editRole).mock.calls.length).toBe(1);
  expect(new Set(vi.mocked(services.editRole).mock.calls[0]?.[1].permissions)).toEqual(
    new Set(["adjust_stock", "view_stock_balances"]),
  );
});

test("duplicating a role saved without a required permission starts with it checked", async () => {
  const services = createServices();
  const screen = await renderModal(
    { kind: "duplicate", source: { ...stockSummary, permissionKeys: ["record_stock_losses"] } },
    services,
  );

  await expect.element(screen.getByText("2 permisos elegidos")).toBeVisible();
});

test("a stale-version save offers to reload, and reloading refreshes the form", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValueOnce({ kind: "ok", value: stockDetail });
  vi.mocked(services.editRole).mockResolvedValue({ kind: "stale_version" });
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");

  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(screen.getByText("Este rol cambió mientras lo editabas")).toBeVisible();

  vi.mocked(services.fetchRole).mockResolvedValueOnce({
    kind: "ok",
    value: { ...stockDetail, name: "Depósito recargado", version: 5 },
  });
  await userEvent.click(screen.getByRole("button", { name: "Recargar" }));

  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito recargado");
});

test("has no accessibility violations", async () => {
  const services = createServices();
  const screen = await renderModal({ kind: "new" }, services);
  await expect.element(screen.getByRole("dialog")).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});

test("editing a role with people assigned opens a confirmation step before saving, listing their names", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stockDetailWithPeople });
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");

  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(screen.getByText("¿Guardar los cambios?")).toBeVisible();
  await expect
    .element(screen.getByText("Se aplican a las 2 personas con el rol Depósito:"))
    .toBeVisible();
  await expect.element(screen.getByText("Amara Ortiz")).toBeVisible();
  await expect.element(screen.getByText("Zoe Almeida")).toBeVisible();
  expect(services.editRole).not.toHaveBeenCalled();
});

test("Volver returns to the editor with edits intact, without saving", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stockDetailWithPeople });
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito senior");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(screen.getByText("¿Guardar los cambios?")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Volver" }));

  await expect.poll(() => screen.getByText("¿Guardar los cambios?").query()).toBeNull();
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito senior");
  expect(services.editRole).not.toHaveBeenCalled();
});

test("confirming the confirmation step proceeds with the normal save", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stockDetailWithPeople });
  vi.mocked(services.editRole).mockResolvedValue({ kind: "ok" });
  const onSaved = vi.fn();
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services, { onSaved });
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(screen.getByText("¿Guardar los cambios?")).toBeVisible();

  await userEvent.click(
    screen
      .getByRole("dialog", { name: "¿Guardar los cambios?" })
      .getByRole("button", { name: "Guardar los cambios" }),
  );

  await expect.poll(() => vi.mocked(services.editRole).mock.calls.length).toBe(1);
  expect(services.editRole).toHaveBeenCalledWith("role-stock", {
    name: "Depósito",
    permissions: ["view_stock_balances"],
    version: 3,
  });
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
});

test("editing a role with nobody assigned saves directly, without the confirmation step", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stockDetail });
  vi.mocked(services.editRole).mockResolvedValue({ kind: "ok" });
  const onSaved = vi.fn();
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services, { onSaved });
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");

  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  expect(screen.getByText("¿Guardar los cambios?").query()).toBeNull();
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
});

test("creating a role never shows the confirmation step", async () => {
  const services = createServices();
  vi.mocked(services.createRole).mockResolvedValue({ kind: "ok" });
  const onSaved = vi.fn();
  const screen = await renderModal({ kind: "new" }, services, { onSaved });

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  expect(screen.getByText("¿Guardar los cambios?").query()).toBeNull();
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
});

test("the confirmation step has no accessibility violations", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stockDetailWithPeople });
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");

  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(screen.getByText("¿Guardar los cambios?")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});

type Screen = Awaited<ReturnType<typeof render>>;

function deferredFetch() {
  let resolve: (outcome: FetchRoleOutcome) => void = () => {};
  const promise = new Promise<FetchRoleOutcome>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function modalFor(request: RoleEditorRequest | null, services: RoleEditorModalServices) {
  return (
    <main>
      <RoleEditorModal
        request={request}
        onClose={() => {}}
        onSaved={() => {}}
        onSessionEnded={() => {}}
        services={services}
      />
    </main>
  );
}

/** Rerendering `ui` unchanged flushes React's act(), committing state a resolved promise chain already set. */
async function flushPendingWork(screen: Screen, ui: ReactElement): Promise<void> {
  await screen.rerender(ui);
}

const cashDetail: RoleDetail = {
  id: "role-cash",
  name: "Caja",
  isAdministrator: false,
  permissionKeys: ["sell_and_charge", "view_sales_history"],
  userCount: 0,
  mayEdit: true,
  version: 8,
  assignedUsers: [],
};

test("ignores a role that arrives late for an edit already replaced by editing another role", async () => {
  const first = deferredFetch();
  const second = deferredFetch();
  const services = createServices();
  vi.mocked(services.fetchRole)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  vi.mocked(services.editRole).mockResolvedValue({ kind: "ok" });
  const screen = await render(modalFor({ kind: "edit", roleId: "role-stock" }, services));
  const ui = modalFor({ kind: "edit", roleId: "role-cash" }, services);
  await screen.rerender(ui);

  second.resolve({ kind: "ok", value: cashDetail });
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Caja");
  first.resolve({ kind: "ok", value: stockDetail });
  await flushPendingWork(screen, ui);

  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Caja");
  await expect.element(screen.getByText("2 permisos elegidos")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  await expect.poll(() => vi.mocked(services.editRole).mock.calls.length).toBe(1);
  expect(services.editRole).toHaveBeenCalledWith("role-cash", {
    name: "Caja",
    permissions: ["sell_and_charge", "view_sales_history"],
    version: 8,
  });
});

test("ignores a role that arrives late for an edit already closed and replaced by a new role", async () => {
  const first = deferredFetch();
  const services = createServices();
  vi.mocked(services.fetchRole).mockReturnValueOnce(first.promise);
  const screen = await render(modalFor({ kind: "edit", roleId: "role-stock" }, services));
  await screen.rerender(modalFor(null, services));
  const ui = modalFor({ kind: "new" }, services);
  await screen.rerender(ui);

  first.resolve({ kind: "ok", value: stockDetail });
  await flushPendingWork(screen, ui);

  await expect.element(screen.getByRole("dialog").getByText("Nuevo rol")).toBeVisible();
  await expect.element(screen.getByRole("textbox", { name: /^Nombre del rol/ })).toHaveValue("");
  await expect.element(screen.getByText("0 permisos elegidos")).toBeVisible();
});

test("ignores a reload that arrives late for an edit already replaced by a new role", async () => {
  const reload = deferredFetch();
  const services = createServices();
  vi.mocked(services.fetchRole)
    .mockResolvedValueOnce({ kind: "ok", value: stockDetail })
    .mockReturnValueOnce(reload.promise);
  vi.mocked(services.editRole).mockResolvedValue({ kind: "stale_version" });
  const screen = await render(modalFor({ kind: "edit", roleId: "role-stock" }, services));
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  await userEvent.click(screen.getByRole("button", { name: "Recargar" }));
  const ui = modalFor({ kind: "new" }, services);
  await screen.rerender(ui);

  reload.resolve({ kind: "ok", value: { ...stockDetail, name: "Depósito recargado" } });
  await flushPendingWork(screen, ui);

  await expect.element(screen.getByRole("textbox", { name: /^Nombre del rol/ })).toHaveValue("");
  await expect.element(screen.getByText("0 permisos elegidos")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Guardar el rol" })).toBeEnabled();
});

test("the confirmation step names the role as it is stored, not the name being typed", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stockDetailWithPeople });
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito senior");

  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect
    .element(screen.getByText("Se aplican a las 2 personas con el rol Depósito:"))
    .toBeVisible();
});

test("at a short desktop viewport, the areas list and the permissions list each scroll on their own while the name row, area title and footer stay put", async () => {
  for (const height of [720, 600]) {
    await page.viewport(1280, height);
    const services = createServices();
    const screen = await renderModal({ kind: "new" }, services);
    await userEvent.click(screen.getByRole("button", { name: /^Compras/ }));

    const dialog = screen.getByRole("dialog").element() as HTMLElement;
    const modalBody = dialog.children[1] as HTMLElement;
    const nameRow = (
      screen.getByRole("textbox", { name: /^Nombre del rol/ }).element() as HTMLElement
    ).closest("div[class*='border-b']") as HTMLElement;
    const areasPane = screen.getByRole("button", { name: /^Caja/ }).element()
      .parentElement as HTMLElement;
    const areaTitle = screen.getByRole("heading", { name: /^Compras/ }).element() as HTMLElement;
    const permissionsList = areaTitle.nextElementSibling as HTMLElement;
    const footer = dialog.lastElementChild as HTMLElement;
    const fixedTops = () =>
      [nameRow, areaTitle, footer].map((element) => element.getBoundingClientRect().top);

    expect(modalBody.scrollHeight, `modal body at ${height}px`).toBe(modalBody.clientHeight);
    for (const pane of [areasPane, permissionsList]) {
      expect(pane.scrollHeight, `pane at ${height}px`).toBeGreaterThan(pane.clientHeight);
      const before = fixedTops();
      pane.scrollTop = pane.scrollHeight;
      await expect.poll(() => pane.scrollTop).toBeGreaterThan(0);
      expect(fixedTops()).toEqual(before);
      expect(modalBody.scrollTop).toBe(0);
    }

    await screen.unmount();
  }
});

function deferred<T>() {
  let resolve: (outcome: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function modalSavingTo(
  request: RoleEditorRequest | null,
  services: RoleEditorModalServices,
  onSaved: () => void,
) {
  return (
    <main>
      <RoleEditorModal
        request={request}
        onClose={() => {}}
        onSaved={onSaved}
        onSessionEnded={() => {}}
        services={services}
      />
    </main>
  );
}

test("while a save is in flight, neither the close button nor Escape dismisses the editor", async () => {
  const pendingSave = deferred<CreateRoleOutcome>();
  const services = createServices({ createRole: vi.fn().mockReturnValue(pendingSave.promise) });
  const onClose = vi.fn();
  const ui = (
    <main>
      <RoleEditorModal
        request={{ kind: "new" }}
        onClose={onClose}
        onSaved={() => {}}
        onSessionEnded={() => {}}
        services={services}
      />
    </main>
  );
  const screen = await render(ui);
  const nameField = screen.getByRole("textbox", { name: /^Nombre del rol/ });
  await userEvent.fill(nameField, "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));
  await expect.poll(() => vi.mocked(services.createRole).mock.calls.length).toBe(1);

  expect(screen.getByRole("button", { name: "Cerrar" }).query()).toBeNull();
  await expect.element(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  await userEvent.click(nameField);
  await expect.element(nameField).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await flushPendingWork(screen, ui);

  expect(onClose).not.toHaveBeenCalled();
});

test("a save that succeeds after the editor moved on to another request never reports the save", async () => {
  const pendingSave = deferred<CreateRoleOutcome>();
  const services = createServices({ createRole: vi.fn().mockReturnValue(pendingSave.promise) });
  const onSaved = vi.fn();
  const screen = await render(modalSavingTo({ kind: "new" }, services, onSaved));
  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));
  await expect.poll(() => vi.mocked(services.createRole).mock.calls.length).toBe(1);
  const ui = modalSavingTo({ kind: "duplicate", source: stockSummary }, services, onSaved);
  await screen.rerender(ui);

  pendingSave.resolve({ kind: "ok" });
  await flushPendingWork(screen, ui);

  expect(onSaved).not.toHaveBeenCalled();
  await expect.element(screen.getByRole("button", { name: "Guardar el rol" })).toBeEnabled();
});

test("a confirmed save that fails after the editor moved on to another request leaves the new request's form untouched", async () => {
  const pendingSave = deferred<EditRoleOutcome>();
  const services = createServices({ editRole: vi.fn().mockReturnValue(pendingSave.promise) });
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stockDetailWithPeople });
  const onSaved = vi.fn();
  const screen = await render(
    modalSavingTo({ kind: "edit", roleId: "role-stock" }, services, onSaved),
  );
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "¿Guardar los cambios?" })
      .getByRole("button", { name: "Guardar los cambios" }),
  );
  await expect.poll(() => vi.mocked(services.editRole).mock.calls.length).toBe(1);
  const ui = modalSavingTo({ kind: "new" }, services, onSaved);
  await screen.rerender(ui);

  pendingSave.resolve({ kind: "name_taken" });
  await flushPendingWork(screen, ui);

  expect(screen.getByText("Ya existe un rol con este nombre.").query()).toBeNull();
  await expect.element(screen.getByRole("textbox", { name: /^Nombre del rol/ })).toHaveValue("");
});

test("ignores a passkey-authorized retry that resolves late after the editor moved on to another request", async () => {
  const retry = deferred<CreateRoleOutcome>();
  const services = createServices({
    createRole: vi
      .fn()
      .mockResolvedValueOnce({ kind: "authorization_required" })
      .mockReturnValueOnce(retry.promise),
  });
  grantAuthorization(services);
  const onSaved = vi.fn();
  const screen = await render(modalSavingTo({ kind: "new" }, services, onSaved));
  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));
  await expect.element(screen.getByRole("heading", { name: "Autorizá este cambio" })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Usar mi passkey" }));
  await expect.poll(() => vi.mocked(services.createRole).mock.calls.length).toBe(2);
  const ui = modalSavingTo({ kind: "duplicate", source: stockSummary }, services, onSaved);
  await screen.rerender(ui);

  retry.resolve({ kind: "ok" });
  await flushPendingWork(screen, ui);

  expect(onSaved).not.toHaveBeenCalled();
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Copia de Depósito");
});

function RefreshProbe({ onReady }: { onReady: (refresh: () => Promise<void>) => void }) {
  const refreshAccess = useRefreshAccess();
  useEffect(() => onReady(refreshAccess));
  return null;
}

function modalWithRefresh(
  request: RoleEditorRequest,
  services: RoleEditorModalServices,
  onReady: (refresh: () => Promise<void>) => void,
) {
  return (
    <main>
      <RefreshProbe onReady={onReady} />
      <RoleEditorModal
        request={request}
        onClose={() => {}}
        onSaved={() => {}}
        onSessionEnded={() => {}}
        services={services}
      />
    </main>
  );
}

test("while the role loads, shows the form's loading placeholder and keeps saving disabled", async () => {
  const services = createServices();
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services);

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  await expect.element(screen.getByRole("button", { name: "Guardar los cambios" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled();
});

test("a load that fails keeps saving disabled and Reintentar starts again from the loading placeholder", async () => {
  const retry = deferred<FetchRoleOutcome>();
  const services = createServices();
  vi.mocked(services.fetchRole)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services);
  await expect.element(screen.getByText("No pudimos abrir este rol")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Guardar los cambios" })).toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  await expect.element(screen.getByText("No pudimos abrir este rol")).not.toBeInTheDocument();
  retry.resolve({ kind: "ok", value: stockDetail });
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
});

test("a rate-limited load shows the time to wait", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 120 });
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("a refresh of the role in the background never overwrites what is being typed", async () => {
  const refresh = deferred<FetchRoleOutcome>();
  const services = createServices();
  vi.mocked(services.fetchRole)
    .mockResolvedValueOnce({ kind: "ok", value: stockDetail })
    .mockReturnValueOnce(refresh.promise);
  let refreshAccess: () => Promise<void> = () => Promise.resolve();
  const screen = await render(
    modalWithRefresh({ kind: "edit", roleId: "role-stock" }, services, (refresh) => {
      refreshAccess = refresh;
    }),
  );
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito nuevo");

  void refreshAccess();
  await expect.poll(() => vi.mocked(services.fetchRole).mock.calls.length).toBe(2);
  await expect.element(screen.getByRole("button", { name: "Guardar los cambios" })).toBeEnabled();
  refresh.resolve({ kind: "ok", value: { ...stockDetail, name: "Otro nombre", version: 9 } });

  await expect.poll(() => vi.mocked(services.fetchRole).mock.calls.length).toBe(2);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito nuevo");
  vi.mocked(services.editRole).mockResolvedValue({ kind: "ok" });
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  await expect.poll(() => vi.mocked(services.editRole).mock.calls.length).toBe(1);
  expect(services.editRole).toHaveBeenCalledWith("role-stock", {
    name: "Depósito nuevo",
    permissions: ["view_stock_balances"],
    version: 3,
  });
});

test("Recargar reads the role again through the cache once and reseeds the form", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole)
    .mockResolvedValueOnce({ kind: "ok", value: stockDetail })
    .mockResolvedValueOnce({
      kind: "ok",
      value: { ...stockDetail, name: "Depósito recargado", version: 5 },
    });
  vi.mocked(services.editRole).mockResolvedValueOnce({ kind: "stale_version" });
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  await userEvent.click(screen.getByRole("button", { name: "Recargar" }));

  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito recargado");
  expect(services.fetchRole).toHaveBeenCalledTimes(2);
  vi.mocked(services.editRole).mockResolvedValueOnce({ kind: "ok" });
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  await expect.poll(() => vi.mocked(services.editRole).mock.calls.length).toBe(2);
  expect(services.editRole).toHaveBeenLastCalledWith("role-stock", {
    name: "Depósito recargado",
    permissions: ["view_stock_balances"],
    version: 5,
  });
});

test("Recargar reseeds a role read without a required permission with that permission added", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole)
    .mockResolvedValueOnce({ kind: "ok", value: stockDetail })
    .mockResolvedValueOnce({
      kind: "ok",
      value: { ...stockDetail, permissionKeys: ["perform_stock_counts"], version: 5 },
    });
  vi.mocked(services.editRole).mockResolvedValueOnce({ kind: "stale_version" });
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services);
  await expect.element(screen.getByText("1 permiso elegido")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  await userEvent.click(screen.getByRole("button", { name: "Recargar" }));

  await expect.element(screen.getByText("2 permisos elegidos")).toBeVisible();
});

test("a Recargar that fails to read the role shows the load failure with Reintentar", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole)
    .mockResolvedValueOnce({ kind: "ok", value: stockDetail })
    .mockResolvedValueOnce({ kind: "failed" });
  vi.mocked(services.editRole).mockResolvedValueOnce({ kind: "stale_version" });
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  await userEvent.click(screen.getByRole("button", { name: "Recargar" }));

  await expect.element(screen.getByText("No pudimos abrir este rol")).toBeVisible();
  vi.mocked(services.fetchRole).mockResolvedValueOnce({ kind: "ok", value: stockDetail });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
});

test("a Recargar that finds the role gone shows the not-found notice", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole)
    .mockResolvedValueOnce({ kind: "ok", value: stockDetail })
    .mockResolvedValueOnce({ kind: "not_found" });
  vi.mocked(services.editRole).mockResolvedValueOnce({ kind: "stale_version" });
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  await userEvent.click(screen.getByRole("button", { name: "Recargar" }));

  await expect.element(screen.getByText("No encontramos este rol").first()).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Guardar los cambios" })).toBeDisabled();
});

test("a save that finds the role gone reads it again and shows the not-found notice", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole)
    .mockResolvedValueOnce({ kind: "ok", value: stockDetail })
    .mockResolvedValueOnce({ kind: "not_found" });
  vi.mocked(services.editRole).mockResolvedValue({ kind: "not_found" });
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");

  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(screen.getByText("No encontramos este rol").first()).toBeVisible();
  expect(services.fetchRole).toHaveBeenCalledTimes(2);
});

function reopenAfterTheRoleGainedPeople(opened: FetchRoleOutcome[]) {
  const fresh = deferredFetch();
  const services = createServices();
  for (const outcome of opened) {
    vi.mocked(services.fetchRole).mockResolvedValueOnce(outcome);
  }
  vi.mocked(services.fetchRole).mockReturnValueOnce(fresh.promise);
  return { services, fresh };
}

async function expectTheFreshRoleAsksToConfirm(
  screen: Screen,
  services: RoleEditorModalServices,
  fresh: ReturnType<typeof deferredFetch>,
) {
  const savesBefore = vi.mocked(services.editRole).mock.calls.length;
  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  await expect.element(screen.getByRole("button", { name: "Guardar los cambios" })).toBeDisabled();

  fresh.resolve({ kind: "ok", value: stockDetailWithPeople });
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(screen.getByText("¿Guardar los cambios?")).toBeVisible();
  await expect.element(screen.getByText("Amara Ortiz")).toBeVisible();
  expect(services.editRole).toHaveBeenCalledTimes(savesBefore);
}

test("reopening the editor for a role read before shows loading, then the role as read again, confirming for its assigned people", async () => {
  const { services, fresh } = reopenAfterTheRoleGainedPeople([{ kind: "ok", value: stockDetail }]);
  const screen = await render(modalFor({ kind: "edit", roleId: "role-stock" }, services));
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  await screen.rerender(modalFor(null, services));
  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();

  await screen.rerender(modalFor({ kind: "edit", roleId: "role-stock" }, services));

  await expectTheFreshRoleAsksToConfirm(screen, services, fresh);
});

test("reopening the editor after a Recargar also reads the role again before showing it", async () => {
  const { services, fresh } = reopenAfterTheRoleGainedPeople([
    { kind: "ok", value: stockDetail },
    { kind: "ok", value: stockDetail },
  ]);
  vi.mocked(services.editRole).mockResolvedValueOnce({ kind: "stale_version" });
  const screen = await render(modalFor({ kind: "edit", roleId: "role-stock" }, services));
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  await userEvent.click(screen.getByRole("button", { name: "Recargar" }));
  await expect.element(screen.getByRole("button", { name: "Recargar" })).not.toBeInTheDocument();
  await screen.rerender(modalFor(null, services));
  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();

  await screen.rerender(modalFor({ kind: "edit", roleId: "role-stock" }, services));

  await expectTheFreshRoleAsksToConfirm(screen, services, fresh);
});
