import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { EditRoleScreen, type EditRoleScreenServices } from "./EditRoleScreen";
import type { RoleDetail } from "./rolesApi";

function createServices(overrides: Partial<EditRoleScreenServices> = {}): EditRoleScreenServices {
  return {
    fetchRole: vi.fn(),
    fetchRoleEditChallenge: vi.fn(),
    editRole: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const reauthenticationOptions = { challenge: "reauth" } as never;
const reauthAssertion = { id: "existing-cred" } as never;

const stock: RoleDetail = {
  id: "role-stock",
  name: "Depósito",
  isAdministrator: false,
  permissionKeys: ["view_stock_balances"],
  userCount: 2,
  version: 1,
};

function renderScreen(
  services: EditRoleScreenServices,
  onSessionEnded: () => void = () => {},
  roleId = "role-stock",
) {
  return render(
    <main>
      <EditRoleScreen
        roleId={roleId}
        isAdministrator
        services={services}
        onSessionEnded={onSessionEnded}
      />
    </main>,
  );
}

test("shows the breadcrumb, heading, and the role's current name and permissions pre-filled", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stock });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Configuración · Roles")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Editar rol", level: 1 })).toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  await expect.element(screen.getByText("1 de 5")).toBeVisible();
  expect(services.fetchRole).toHaveBeenCalledWith("role-stock");
});

test("shows a not-found state for a missing or Administrator id", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "not_found" });

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("alert")).toHaveTextContent("No encontramos este rol");
});

test("shows a forbidden notice, without calling the API, for a non-Administrator", async () => {
  const services = createServices();

  const screen = await render(
    <main>
      <EditRoleScreen
        roleId="role-stock"
        isAdministrator={false}
        services={services}
        onSessionEnded={() => {}}
      />
    </main>,
  );

  await expect.element(screen.getByText("No tenés acceso a Roles")).toBeVisible();
  expect(services.fetchRole).not.toHaveBeenCalled();
});

test("shows a load error, and Reintentar loads the role again", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir este rol")).toBeVisible();

  vi.mocked(services.fetchRole).mockResolvedValueOnce({ kind: "ok", value: stock });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  expect(services.fetchRole).toHaveBeenCalledTimes(2);
});

test("shows a rate-limited notice with the minutes to wait when loading is rate limited", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 120 });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("ends the session when the load finds it closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("Cancelar navigates back to the roles list without calling editRole", async () => {
  window.history.pushState(null, "", "/settings/roles/role-stock/edit");
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stock });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");

  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

  expect(window.location.pathname).toBe("/settings/roles");
  expect(services.fetchRoleEditChallenge).not.toHaveBeenCalled();
  window.history.pushState(null, "", "/");
});

test("requires a non-empty name that is not the Administrator's own, without calling the API", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stock });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "   ");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(screen.getByText("Ingresá el nombre del rol.")).toBeVisible();
  expect(services.fetchRoleEditChallenge).not.toHaveBeenCalled();
});

test("saves the edit through the passkey step-up and returns to the roles list", async () => {
  window.history.pushState(null, "", "/settings/roles/role-stock/edit");
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stock });
  vi.mocked(services.fetchRoleEditChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.editRole).mockResolvedValue({ kind: "ok", value: { ...stock, version: 2 } });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito senior");
  await userEvent.click(screen.getByText("Ajustes").element());
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editRole).mock.calls.length).toBe(1);
  expect(services.editRole).toHaveBeenCalledWith(
    "role-stock",
    {
      name: "Depósito senior",
      permissionKeys: ["view_stock_balances", "adjust_stock"],
      version: 1,
    },
    reauthAssertion,
  );
  await expect.poll(() => window.location.pathname).toBe("/settings/roles");
  window.history.pushState(null, "", "/");
});

test("shows name_taken as a field error and keeps the form", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stock });
  vi.mocked(services.fetchRoleEditChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.editRole).mockResolvedValue({ kind: "name_taken" });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Cajera");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(screen.getByText("Ya existe un rol con este nombre.")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Editar rol", level: 1 })).toBeVisible();
});

test("shows a notice, not calling editRole, when the passkey prompt is cancelled", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stock });
  vi.mocked(services.fetchRoleEditChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockRejectedValue(new Error("NotAllowedError"));
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");

  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(screen.getByText("No se pudo guardar el rol")).toBeVisible();
  expect(services.editRole).not.toHaveBeenCalled();
});

test("ends the session when edit-options finds it closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stock });
  vi.mocked(services.fetchRoleEditChallenge).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");

  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("shows a stale_version notice, and Recargar refetches the role so the second save sends the new version", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValueOnce({ kind: "ok", value: stock });
  vi.mocked(services.fetchRoleEditChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.editRole).mockResolvedValueOnce({ kind: "stale_version" });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito nuevo");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(screen.getByText("Este rol cambió mientras lo editabas")).toBeVisible();

  const reloaded: RoleDetail = { ...stock, name: "Depósito recargado", version: 5 };
  vi.mocked(services.fetchRole).mockResolvedValueOnce({ kind: "ok", value: reloaded });
  await userEvent.click(screen.getByRole("button", { name: "Recargar" }));

  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito recargado");
  await expect
    .poll(() => screen.getByText("Este rol cambió mientras lo editabas").query())
    .toBeNull();

  vi.mocked(services.editRole).mockResolvedValueOnce({
    kind: "ok",
    value: { ...reloaded, version: 6 },
  });
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editRole).mock.calls.length).toBe(2);
  expect(services.editRole).toHaveBeenLastCalledWith(
    "role-stock",
    { name: "Depósito recargado", permissionKeys: ["view_stock_balances"], version: 5 },
    reauthAssertion,
  );
});

test("shows a reload-failed notice when Recargar cannot reach the role, and Recargar again refetches", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValueOnce({ kind: "ok", value: stock });
  vi.mocked(services.fetchRoleEditChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.editRole).mockResolvedValueOnce({ kind: "stale_version" });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(screen.getByText("Este rol cambió mientras lo editabas")).toBeVisible();

  vi.mocked(services.fetchRole).mockResolvedValueOnce({ kind: "failed" });
  await userEvent.click(screen.getByRole("button", { name: "Recargar" }));

  await expect.element(screen.getByText("No se pudieron recargar los datos")).toBeVisible();

  vi.mocked(services.fetchRole).mockResolvedValueOnce({ kind: "ok", value: stock });
  await userEvent.click(screen.getByRole("button", { name: "Recargar" }));

  await expect.poll(() => screen.getByText("No se pudieron recargar los datos").query()).toBeNull();
});

test("has no accessibility violations once loaded", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stock });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Editar rol", level: 1 })).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});
