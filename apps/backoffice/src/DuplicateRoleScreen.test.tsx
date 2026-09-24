import { PERMISSION_CATALOG, PERMISSION_KEYS } from "@purosur/contracts";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { DuplicateRoleScreen, type DuplicateRoleScreenServices } from "./DuplicateRoleScreen";
import type { RoleSummary } from "./rolesApi";

function createServices(
  overrides: Partial<DuplicateRoleScreenServices> = {},
): DuplicateRoleScreenServices {
  return {
    fetchRoles: vi.fn(),
    fetchRoleCreationChallenge: vi.fn(),
    createRole: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const reauthenticationOptions = { challenge: "reauth" } as never;
const reauthAssertion = { id: "existing-cred" } as never;

// The real GET /roles always reports the Administrator row with the full catalog (see
// roles-list-route.ts's listRoles), never an empty list: that's exactly the source this screen
// duplicates every permission from.
const administrator: RoleSummary = {
  id: "role-admin",
  name: null,
  isAdministrator: true,
  permissionKeys: [...PERMISSION_KEYS],
  userCount: 1,
};

const stock: RoleSummary = {
  id: "role-stock",
  name: "Depósito",
  isAdministrator: false,
  permissionKeys: ["view_stock_balances"],
  userCount: 2,
};

const createdRole = {
  id: "role-stock-2",
  name: "Copia de Depósito",
  isAdministrator: false,
  permissionKeys: ["view_stock_balances"],
  userCount: 0,
};

function renderScreen(
  services: DuplicateRoleScreenServices,
  onSessionEnded: () => void = () => {},
  roleId = "role-stock",
) {
  return render(
    <main>
      <DuplicateRoleScreen roleId={roleId} services={services} onSessionEnded={onSessionEnded} />
    </main>,
  );
}

test("navigates to Mi cuenta when the source roles read comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/roles/role-stock/duplicate");
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("pre-fills the name and permissions from a hand-made source role", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "ok", value: [administrator, stock] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Configuración · Roles")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Duplicar rol", level: 1 }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Copia de Depósito");
  await expect.element(screen.getByText("1 de 5")).toBeVisible();
});

test("pre-fills every catalog permission and the Administrator's own display name when duplicating Administrator", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "ok", value: [administrator, stock] });

  const screen = await renderScreen(services, () => {}, "role-admin");

  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Copia de Administrador");
  await expect
    .element(screen.getByRole("heading", { name: "Backups 2 de 2", level: 2 }))
    .toBeVisible();
});

test("duplicating Administrator saves exactly the one alert view its form shows", async () => {
  window.history.pushState(null, "", "/settings/roles/role-admin/duplicate");
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "ok", value: [administrator, stock] });
  vi.mocked(services.fetchRoleCreationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.createRole).mockResolvedValue({ kind: "ok", value: createdRole });
  const screen = await renderScreen(services, () => {}, "role-admin");
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Copia de Administrador");
  await expect.element(screen.getByRole("radio", { name: "Ver todas las alertas" })).toBeChecked();
  const alertKeys: string[] = PERMISSION_CATALOG.filter(
    (definition) => definition.area === "alerts",
  ).map((definition) => definition.key);
  const shownAlertCount = 2;
  await expect
    .element(
      screen.getByRole("heading", {
        name: `Alertas ${shownAlertCount} de ${alertKeys.length}`,
        level: 2,
      }),
    )
    .toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.poll(() => vi.mocked(services.createRole).mock.calls.length).toBe(1);
  const [payload] = vi.mocked(services.createRole).mock.calls[0] ?? [];
  expect(payload?.permissionKeys).toContain("view_all_alerts");
  expect(payload?.permissionKeys).not.toContain("view_branch_alerts");
  expect(payload?.permissionKeys.filter((key) => alertKeys.includes(key))).toHaveLength(
    shownAlertCount,
  );
  window.history.pushState(null, "", "/");
});

test("shows a not-found state when the source role id isn't in the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "ok", value: [administrator] });

  const screen = await renderScreen(services, () => {}, "role-missing");

  await expect.element(screen.getByRole("alert")).toHaveTextContent("No encontramos este rol");
});

test("shows a load error, and Reintentar loads the role again", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir este rol")).toBeVisible();

  vi.mocked(services.fetchRoles).mockResolvedValueOnce({
    kind: "ok",
    value: [administrator, stock],
  });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Copia de Depósito");
  expect(services.fetchRoles).toHaveBeenCalledTimes(2);
});

test("shows a rate-limited notice with the minutes to wait when loading is rate limited", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("ends the session when the load finds it closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("Cancelar navigates back to the roles list without calling the creation API", async () => {
  window.history.pushState(null, "", "/settings/roles/role-stock/duplicate");
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "ok", value: [administrator, stock] });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Copia de Depósito");

  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

  expect(window.location.pathname).toBe("/settings/roles");
  expect(services.fetchRoleCreationChallenge).not.toHaveBeenCalled();
  window.history.pushState(null, "", "/");
});

test("creates the duplicate through the passkey step-up and returns to the roles list", async () => {
  window.history.pushState(null, "", "/settings/roles/role-stock/duplicate");
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "ok", value: [administrator, stock] });
  vi.mocked(services.fetchRoleCreationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.createRole).mockResolvedValue({ kind: "ok", value: createdRole });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Copia de Depósito");

  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.poll(() => vi.mocked(services.createRole).mock.calls.length).toBe(1);
  expect(services.createRole).toHaveBeenCalledWith(
    { name: "Copia de Depósito", permissionKeys: ["view_stock_balances"] },
    reauthAssertion,
  );
  await expect.poll(() => window.location.pathname).toBe("/settings/roles");
  window.history.pushState(null, "", "/");
});

test("shows name_taken as a field error on Nombre del rol and keeps the form", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "ok", value: [administrator, stock] });
  vi.mocked(services.fetchRoleCreationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.createRole).mockResolvedValue({ kind: "name_taken" });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Copia de Depósito");

  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.element(screen.getByText("Ya existe un rol con este nombre.")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Duplicar rol", level: 1 }))
    .toBeVisible();
});

test("shows a notice, not calling createRole, when the passkey prompt is cancelled", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "ok", value: [administrator, stock] });
  vi.mocked(services.fetchRoleCreationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockRejectedValue(new Error("NotAllowedError"));
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Copia de Depósito");

  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.element(screen.getByText("No se pudo crear el rol")).toBeVisible();
  expect(services.createRole).not.toHaveBeenCalled();
});

test("shows a rate-limited notice when creation-options is rate limited", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "ok", value: [administrator, stock] });
  vi.mocked(services.fetchRoleCreationChallenge).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Copia de Depósito");

  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("ends the session when creation-options finds the session already ended", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "ok", value: [administrator, stock] });
  vi.mocked(services.fetchRoleCreationChallenge).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Copia de Depósito");

  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("has no accessibility violations once loaded", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoles).mockResolvedValue({ kind: "ok", value: [administrator, stock] });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("heading", { name: "Duplicar rol", level: 1 }))
    .toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});
