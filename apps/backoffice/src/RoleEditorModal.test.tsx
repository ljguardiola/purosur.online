import type { ReactElement } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import {
  RoleEditorModal,
  type RoleEditorModalServices,
  type RoleEditorRequest,
} from "./RoleEditorModal";
import type {
  CreateRoleOutcome,
  EditRoleOutcome,
  FetchRoleOutcome,
  RoleDetail,
  RoleSummary,
} from "./rolesApi";

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

const stockDetailWithPeople: RoleDetail = {
  ...stockDetail,
  userCount: 2,
  assignedUsers: [
    { id: "user-amara", name: "Amara Ortiz" },
    { id: "user-zoe", name: "Zoe Almeida" },
  ],
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

test("draws the name row and both panes flush to the panel's own edges, not inset by Modal's default body padding", async () => {
  const services = createServices();
  const screen = await renderModal({ kind: "new" }, services);
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
  // The areas pane runs flush from the name row's own bottom border to the footer's top border.
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
  vi.mocked(services.editRole).mockResolvedValue({
    kind: "ok",
    value: { ...stockDetailWithPeople, version: 4 },
  });
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
    permissionKeys: ["view_stock_balances"],
    version: 3,
  });
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
});

test("editing a role with nobody assigned saves directly, without the confirmation step", async () => {
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

  expect(screen.getByText("¿Guardar los cambios?").query()).toBeNull();
  await expect.poll(() => onSaved.mock.calls.length).toBe(1);
});

test("creating a role never shows the confirmation step", async () => {
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

/**
 * Lets a late response's own guarded continuation run to completion, and React commit whatever it
 * would set, before asserting it didn't. Awaiting the exact promise the continuation is itself
 * awaiting queues after that continuation's own `.then` (registered first, when the request was
 * made), so this turn already runs it. A state update made from outside any event handler (like
 * that continuation's `setState` calls) schedules its commit through React's own Scheduler, which
 * can land on a later macrotask rather than the next microtask; rerendering the same, unchanged
 * `ui` forces that commit through `act()` before this returns, the same way a real interaction
 * would, instead of guessing how many ticks or milliseconds it takes.
 */
async function settleLateResponse(
  screen: Screen,
  ui: ReactElement,
  resolved: Promise<unknown> = Promise.resolve(),
): Promise<void> {
  await resolved;
  await screen.rerender(ui);
}

const cashDetail: RoleDetail = {
  id: "role-cash",
  name: "Caja",
  isAdministrator: false,
  permissionKeys: ["sell_and_charge", "view_sales_history"],
  userCount: 0,
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
  vi.mocked(services.editRole).mockResolvedValue({ kind: "ok", value: cashDetail });
  const screen = await render(modalFor({ kind: "edit", roleId: "role-stock" }, services));
  const ui = modalFor({ kind: "edit", roleId: "role-cash" }, services);
  await screen.rerender(ui);

  second.resolve({ kind: "ok", value: cashDetail });
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Caja");
  first.resolve({ kind: "ok", value: stockDetail });
  await settleLateResponse(screen, ui, first.promise);

  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Caja");
  await expect.element(screen.getByText("2 permisos elegidos")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  await expect.poll(() => vi.mocked(services.editRole).mock.calls.length).toBe(1);
  expect(services.editRole).toHaveBeenCalledWith("role-cash", {
    name: "Caja",
    permissionKeys: ["sell_and_charge", "view_sales_history"],
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
  await settleLateResponse(screen, ui, first.promise);

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
  await settleLateResponse(screen, ui, reload.promise);

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

test("draws the confirmation step as one centered column, 12px apart, with only Volver and Guardar los cambios, and Escape still goes back", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stockDetailWithPeople });
  const screen = await renderModal({ kind: "edit", roleId: "role-stock" }, services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  const confirmation = screen.getByRole("dialog", { name: "¿Guardar los cambios?" });
  await expect.element(confirmation).toBeVisible();

  const buttonNames = Array.from(
    (confirmation.element() as HTMLElement).querySelectorAll("button"),
    (button) => button.textContent,
  );
  expect(buttonNames).toEqual(["Volver", "Guardar los cambios"]);
  const title = confirmation.getByRole("heading").element().getBoundingClientRect();
  const text = confirmation
    .getByText(/^Se aplican/)
    .element()
    .getBoundingClientRect();
  const names = (confirmation.getByText("Amara Ortiz").element().parentElement as HTMLElement)
    .parentElement as HTMLElement;
  expect(text.top - title.bottom).toBeCloseTo(12, 0);
  expect(names.getBoundingClientRect().top - text.bottom).toBeCloseTo(12, 0);

  await userEvent.keyboard("{Escape}");

  await expect.poll(() => screen.getByText("¿Guardar los cambios?").query()).toBeNull();
  expect(services.editRole).not.toHaveBeenCalled();
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
  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));
  await expect.poll(() => vi.mocked(services.createRole).mock.calls.length).toBe(1);

  expect(screen.getByRole("button", { name: "Cerrar" }).query()).toBeNull();
  await expect.element(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  await userEvent.keyboard("{Escape}");
  await settleLateResponse(screen, ui);

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

  pendingSave.resolve({
    kind: "ok",
    value: {
      id: "role-new",
      name: "Depósito",
      isAdministrator: false,
      permissionKeys: [],
      userCount: 0,
    },
  });
  await settleLateResponse(screen, ui, pendingSave.promise);

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
  await settleLateResponse(screen, ui, pendingSave.promise);

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

  retry.resolve({
    kind: "ok",
    value: {
      id: "role-new",
      name: "Depósito",
      isAdministrator: false,
      permissionKeys: [],
      userCount: 0,
    },
  });
  await settleLateResponse(screen, ui, retry.promise);

  expect(onSaved).not.toHaveBeenCalled();
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Copia de Depósito");
});
