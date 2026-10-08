import type { PermissionCatalogWire } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import type { RoleSummary } from "../platform/roles-api";
import { permissionCatalogFixture } from "../platform/test-support/permission-catalog";
import { render } from "../shell/test-support/render-with-router";
import { RolesListScreen } from "./roles-list-screen";
import type { RolesListScreenServices } from "./roles-list-services";

function createServices(
  overrides: Partial<RolesListScreenServices> = {},
): RolesListScreenServices & Required<Pick<RolesListScreenServices, "roleEditorModal">> {
  const fetchPermissionCatalog =
    overrides.fetchPermissionCatalog ??
    vi.fn().mockResolvedValue({ kind: "ok", value: permissionCatalogFixture });
  return {
    fetchRoles: vi.fn(),
    fetchPermissionCatalog,
    roleEditorModal: {
      fetchRole: vi.fn().mockReturnValue(new Promise(() => {})),
      fetchPermissionCatalog,
      createRole: vi.fn(),
      editRole: vi.fn(),
      fetchSessionAuthorizationOptions: vi.fn(),
      authorizeSession: vi.fn(),
      startAuthentication: vi.fn(),
    },
    ...overrides,
  };
}

const administrator: RoleSummary = {
  id: "role-admin",
  name: null,
  isAdministrator: true,
  permissionKeys: [],
  userCount: 1,
  mayEdit: false,
};

const stock: RoleSummary = {
  id: "role-stock",
  name: "Depósito",
  isAdministrator: false,
  permissionKeys: ["view_stock_balances", "adjust_stock"],
  userCount: 0,
  mayEdit: true,
};

const cashier: RoleSummary = {
  id: "role-cashier",
  name: "Cajera",
  isAdministrator: false,
  permissionKeys: ["sell_and_charge"],
  userCount: 3,
  mayEdit: true,
};

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function renderScreen(services: RolesListScreenServices, onSessionEnded: () => void = () => {}) {
  return render(
    <main>
      <RolesListScreen services={services} onSessionEnded={onSessionEnded} />
    </main>,
  );
}

test("shows the breadcrumb, heading, Administrator's full permission count, and the role count", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "ok", value: [administrator] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Configuración")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Roles", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Administrador")).toBeVisible();
  await expect.element(screen.getByText("Todos los permisos")).toBeVisible();
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  await expect.element(screen.getByText("1 rol")).toBeVisible();
});

test("shows a hand-picked role's name, its permission count out of the full catalog, and its user count", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({
    kind: "ok",
    value: [administrator, stock, cashier],
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Depósito")).toBeVisible();
  await expect.element(screen.getByText("2 de 49 permisos")).toBeVisible();
  await expect.element(screen.getByText("Sin usuarios")).toBeVisible();
  await expect.element(screen.getByText("Cajera")).toBeVisible();
  await expect.element(screen.getByText("1 de 49 permisos")).toBeVisible();
  await expect.element(screen.getByText("3 usuarios")).toBeVisible();
  await expect.element(screen.getByText("3 roles")).toBeVisible();
});

test("keeps the table loading until the permission catalog arrives, since each row's total comes from it", async () => {
  const catalog = deferred<CloudReadOutcome<PermissionCatalogWire>>();
  const services = createServices({
    fetchPermissionCatalog: vi.fn().mockReturnValue(catalog.promise),
  });
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "ok", value: [stock] });

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Roles" }))
    .toHaveAttribute("aria-busy", "true");
  expect(screen.getByText("Depósito").elements()).toHaveLength(0);

  catalog.resolve({ kind: "ok", value: permissionCatalogFixture });
  await expect.element(screen.getByText("2 de 49 permisos")).toBeVisible();
});

test("a permission catalog that fails to load fails the table, and Reintentar reads it again", async () => {
  const services = createServices({
    fetchPermissionCatalog: vi
      .fn()
      .mockResolvedValueOnce({ kind: "failed" })
      .mockResolvedValueOnce({ kind: "ok", value: permissionCatalogFixture }),
  });
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "ok", value: [stock] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir los roles")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("2 de 49 permisos")).toBeVisible();
});

test("shows a duplicate action on every row, including Administrator, opening the editor modal pre-filled from that row", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({
    kind: "ok",
    value: [administrator, stock],
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 roles")).toBeVisible();

  expect(screen.getByRole("button", { name: /^Duplicar el rol/ }).elements()).toHaveLength(2);
  await userEvent.click(screen.getByRole("button", { name: "Duplicar el rol Depósito" }));

  await expect.element(screen.getByRole("dialog").getByText("Duplicar rol")).toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Copia de Depósito");
});

test("shows the duplicate action before the pencil action, on a hand-made role row", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({
    kind: "ok",
    value: [stock],
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 rol")).toBeVisible();

  const rowActionNames = screen
    .getByRole("button", { name: /^(Duplicar|Editar) el rol/ })
    .elements()
    .map((button) => button.getAttribute("aria-label"));
  expect(rowActionNames).toEqual(["Duplicar el rol Depósito", "Editar el rol Depósito"]);
});

test("shows the Rol, Permisos, Usuarios, and Acciones columns", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "ok", value: [administrator] });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 rol")).toBeVisible();

  expect(
    screen
      .getByRole("columnheader")
      .elements()
      .map((header) => header.textContent),
  ).toEqual(["Rol", "Permisos", "Usuarios", "Acciones"]);
});

test("shows a pencil edit action on a hand-made role row, opening the editor modal for that role's id", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({
    kind: "ok",
    value: [administrator, stock],
  });
  const roleEditorModal = services.roleEditorModal;
  if (!roleEditorModal) {
    throw new Error("test setup: createServices always fills roleEditorModal");
  }
  vi.mocked(roleEditorModal.fetchRole).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 roles")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Editar el rol Depósito" }));

  await expect.element(screen.getByRole("dialog").getByText("Editar rol")).toBeVisible();
  expect(roleEditorModal.fetchRole).toHaveBeenCalledWith("role-stock");
});

test("shows no edit action on the Administrator row", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({
    kind: "ok",
    value: [administrator, stock],
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 roles")).toBeVisible();

  expect(screen.getByRole("button", { name: /^Editar el rol/ }).elements()).toHaveLength(1);
});

test("offers the edit action of a role the cloud says may be edited, and none for one it says may not", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({
    kind: "ok",
    value: [{ ...stock, mayEdit: false }, cashier],
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 roles")).toBeVisible();

  const editActionNames = screen
    .getByRole("button", { name: /^Editar el rol/ })
    .elements()
    .map((button) => button.getAttribute("aria-label"));
  expect(editActionNames).toEqual(["Editar el rol Cajera"]);
});

test("keeps the loaded list without refetching when the parent re-renders with a new onSessionEnded", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services, () => {});
  await expect.element(screen.getByText("1 rol")).toBeVisible();

  await screen.rerender(
    <main>
      <RolesListScreen services={services} onSessionEnded={() => {}} />
    </main>,
  );

  await expect.element(screen.getByText("1 rol")).toBeVisible();
  expect(services.fetchRoles).toHaveBeenCalledTimes(1);
});

test("the Nuevo rol button opens the editor modal, empty, over the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 rol")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));

  await expect.element(screen.getByRole("dialog").getByText("Nuevo rol")).toBeVisible();
  await expect.element(screen.getByRole("textbox", { name: /^Nombre del rol/ })).toHaveValue("");
});

test("shows the roles table loading while the roles are on their way", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Roles" }))
    .toHaveAttribute("aria-busy", "true");
});

test("shows an empty state when there are no roles yet", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Todavía no hay roles")).toBeVisible();
  await expect.element(screen.getByText("0 roles")).not.toBeInTheDocument();
});

test("shows a load error with a retry action when the roles fail to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir los roles")).toBeVisible();

  vi.mocked(services.fetchRoles).mockResolvedValueOnce({ kind: "ok", value: [administrator] });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("1 rol")).toBeVisible();
});

test("retrying a failed load starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchRoles>>>();
  vi.mocked(services.fetchRoles)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir los roles")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("No pudimos abrir los roles")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("table", { name: "Roles" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: [administrator] });
  await expect.element(screen.getByText("1 rol")).toBeVisible();
});

test("shows the rate-limited notice with the time to wait and a retry action", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValueOnce({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();

  vi.mocked(services.fetchRoles).mockResolvedValueOnce({ kind: "ok", value: [administrator] });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("1 rol")).toBeVisible();
});

test("Nuevo rol stays available while the roles load and after they fail to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Nuevo rol" })).toBeEnabled();
  await expect.element(screen.getByText("No pudimos abrir los roles")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Nuevo rol" })).toBeEnabled();
});

test("saving a role reads the roles again from the server, keeping the shown rows while it does", async () => {
  await page.viewport(1280, 900);
  const services = createServices();
  const refresh = deferred<Awaited<ReturnType<typeof services.fetchRoles>>>();
  vi.mocked(services.fetchRoles)
    .mockResolvedValueOnce({ kind: "ok", value: [administrator, stock] })
    .mockReturnValueOnce(refresh.promise);
  vi.mocked(services.roleEditorModal.createRole).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 roles")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Duplicar el rol Depósito" }));

  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Guardar el rol" }));

  await expect
    .element(screen.getByRole("table", { name: "Roles" }))
    .toHaveAttribute("aria-busy", "true");
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(screen.getByText("Depósito").query()).not.toBeNull();
  await expect
    .element(screen.getByRole("button", { name: "Duplicar el rol Depósito" }))
    .toBeEnabled();
  refresh.resolve({
    kind: "ok",
    value: [administrator, stock, { ...stock, id: "role-copy", name: "Copia de Depósito" }],
  });
  await expect.element(screen.getByText("3 roles")).toBeVisible();
  expect(services.fetchRoles).toHaveBeenCalledTimes(2);
});

test("ends the session when the roles request finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the roles request comes back forbidden", async () => {
  window.history.pushState(null, "", "/roles");
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
  window.history.pushState(null, "", "/");
});

test("has no accessibility violations once loaded", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "ok", value: [administrator, stock] });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("2 roles")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});

test("the editor modal closes when the roles fail to load again, and never reopens by itself", async () => {
  await page.viewport(1280, 900);
  const services = createServices();
  vi.mocked(services.fetchRoles)
    .mockResolvedValueOnce({ kind: "ok", value: [administrator, stock] })
    .mockResolvedValueOnce({ kind: "failed" });
  vi.mocked(services.roleEditorModal.fetchRole).mockResolvedValue({
    kind: "ok",
    value: { ...stock, version: 1, assignedUsers: [] },
  });
  vi.mocked(services.roleEditorModal.editRole).mockResolvedValue({ kind: "stale_version" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 roles")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Editar el rol Depósito" }));
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await userEvent.click(screen.getByRole("button", { name: "Recargar" }));

  await expect.element(screen.getByText("No pudimos abrir los roles")).toBeVisible();
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  vi.mocked(services.fetchRoles).mockResolvedValueOnce({
    kind: "ok",
    value: [administrator, stock],
  });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await expect.element(screen.getByText("2 roles")).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
});
