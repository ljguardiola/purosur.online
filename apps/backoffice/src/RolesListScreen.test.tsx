import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { RolesListScreen, type RolesListScreenServices } from "./RolesListScreen";
import type { RoleSummary } from "./rolesApi";

function createServices(overrides: Partial<RolesListScreenServices> = {}): RolesListScreenServices {
  return { fetchRoles: vi.fn(), ...overrides };
}

const administrator: RoleSummary = {
  id: "role-admin",
  name: null,
  isAdministrator: true,
  permissionKeys: [],
  userCount: 1,
};

const stock: RoleSummary = {
  id: "role-stock",
  name: "Depósito",
  isAdministrator: false,
  permissionKeys: ["view_stock_balances", "adjust_stock"],
  userCount: 0,
};

const cashier: RoleSummary = {
  id: "role-cashier",
  name: "Cajera",
  isAdministrator: false,
  permissionKeys: ["sell_and_charge"],
  userCount: 3,
};

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
  await expect.element(screen.getByText("2 de 48 permisos")).toBeVisible();
  await expect.element(screen.getByText("Sin usuarios")).toBeVisible();
  await expect.element(screen.getByText("Cajera")).toBeVisible();
  await expect.element(screen.getByText("1 de 48 permisos")).toBeVisible();
  await expect.element(screen.getByText("3 usuarios")).toBeVisible();
  await expect.element(screen.getByText("3 roles")).toBeVisible();
});

test("shows a duplicate action on every row, including Administrator, navigating to that role's duplicate page", async () => {
  window.history.pushState(null, "", "/settings/roles");
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({
    kind: "ok",
    value: [administrator, stock],
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 roles")).toBeVisible();

  expect(screen.getByRole("button", { name: /^Duplicar el rol/ }).elements()).toHaveLength(2);
  await userEvent.click(screen.getByRole("button", { name: "Duplicar el rol Depósito" }));

  expect(window.location.pathname).toBe("/settings/roles/role-stock/duplicate");
  window.history.pushState(null, "", "/");
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

test("shows a pencil edit action on a hand-made role row, navigating to its edit page", async () => {
  window.history.pushState(null, "", "/settings/roles");
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({
    kind: "ok",
    value: [administrator, stock],
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 roles")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Editar el rol Depósito" }));

  expect(window.location.pathname).toBe("/settings/roles/role-stock/edit");
  window.history.pushState(null, "", "/");
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

test("the Nuevo rol button navigates to the new role page", async () => {
  window.history.pushState(null, "", "/settings/roles");
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 rol")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Nuevo rol" }));

  expect(window.location.pathname).toBe("/settings/roles/new");
  window.history.pushState(null, "", "/");
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

test("shows a rate-limited notice with a retry action", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValueOnce({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();

  vi.mocked(services.fetchRoles).mockResolvedValueOnce({ kind: "ok", value: [administrator] });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("1 rol")).toBeVisible();
});

test("ends the session when the roles request finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the roles request comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/roles");
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("has no accessibility violations once loaded", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "ok", value: [administrator, stock] });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("2 roles")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});
