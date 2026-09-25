import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import {
  RoleEditorModal,
  type RoleEditorModalServices,
  type RoleEditorRequest,
} from "./RoleEditorModal";
import type { RoleDetail, RoleSummary } from "./rolesApi";

// The editor modal is 1040px wide, wider than the browser mode's own phone-sized default
// viewport (see Tooltip.test.tsx's own comment on that default), which leaves its footer's save
// button outside the viewport and unclickable.
beforeEach(async () => {
  await page.viewport(1280, 900);
});

function createServices(overrides: Partial<RoleEditorModalServices> = {}): RoleEditorModalServices {
  return {
    fetchRole: vi.fn().mockReturnValue(new Promise(() => {})),
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

/** Sets up an already-granted passkey authorization, for a test that isn't about that ceremony itself. */
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
  version: 3,
  assignedUsers: [],
};

const stockSummary: RoleSummary = {
  id: "role-stock",
  name: "Depósito",
  isAdministrator: false,
  permissionKeys: ["sell_and_charge", "view_branch_alerts", "view_all_alerts"],
  userCount: 0,
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

test("creates the role directly, without the authorization modal, when the session already has one", async () => {
  const services = createServices();
  vi.mocked(services.createRole).mockResolvedValue({
    kind: "ok",
    value: {
      id: "role-new",
      name: "Depósito",
      isAdministrator: false,
      permissionKeys: [],
      userCount: 0,
    },
  });
  const onSaved = vi.fn();
  const screen = await renderModal({ kind: "new" }, services, { onSaved });

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: /^Stock/ }));
  await userEvent.click(screen.getByText("Ver saldos").element());
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.poll(() => vi.mocked(services.createRole).mock.calls.length).toBe(1);
  expect(services.createRole).toHaveBeenCalledWith({
    name: "Depósito",
    permissionKeys: ["view_stock_balances"],
  });
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
});

test("opens the nested authorization modal on authorization_required, then authorizes and retries the save", async () => {
  const services = createServices();
  vi.mocked(services.createRole).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.createRole).mockResolvedValueOnce({
    kind: "ok",
    value: {
      id: "role-new",
      name: "Depósito",
      isAdministrator: false,
      permissionKeys: [],
      userCount: 0,
    },
  });
  const onSaved = vi.fn();
  const screen = await renderModal({ kind: "new" }, services, { onSaved });

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.element(screen.getByRole("heading", { name: "Autorizá este cambio" })).toBeVisible();
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
  vi.mocked(services.editRole).mockResolvedValue({
    kind: "ok",
    value: { ...stockDetail, version: 4 },
  });
  const onSaved = vi.fn();
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services, { onSaved });
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");

  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editRole).mock.calls.length).toBe(1);
  expect(services.editRole).toHaveBeenCalledWith("role-stock", {
    name: "Depósito",
    permissionKeys: ["view_stock_balances"],
    version: 3,
  });
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
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
