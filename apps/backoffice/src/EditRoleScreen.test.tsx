import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { EditRoleScreen, type EditRoleScreenServices } from "./EditRoleScreen";
import type { RoleDetail } from "./rolesApi";

function createServices(overrides: Partial<EditRoleScreenServices> = {}): EditRoleScreenServices {
  return {
    fetchRole: vi.fn(),
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
function grantAuthorization(services: EditRoleScreenServices) {
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
}

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
      <EditRoleScreen roleId={roleId} services={services} onSessionEnded={onSessionEnded} />
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

test("navigates to Mi cuenta when the role read comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/roles/role-stock/edit");
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("navigates to Mi cuenta, without the authorization modal, when saving the edit comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/roles/role-stock/edit");
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stock });
  vi.mocked(services.editRole).mockResolvedValue({ kind: "forbidden" });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");

  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  expect(services.fetchSessionAuthorizationOptions).not.toHaveBeenCalled();
  window.history.pushState(null, "", "/");
});

test("navigates to Mi cuenta when the edit retried after the authorization comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/roles/role-stock/edit");
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stock });
  vi.mocked(services.editRole).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.editRole).mockResolvedValueOnce({ kind: "forbidden" });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");

  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Usar mi passkey" }),
  );

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
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
  expect(services.editRole).not.toHaveBeenCalled();
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
  expect(services.editRole).not.toHaveBeenCalled();
});

test("saves the edit directly, without the authorization modal, when the session already has one", async () => {
  window.history.pushState(null, "", "/settings/roles/role-stock/edit");
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stock });
  vi.mocked(services.editRole).mockResolvedValue({ kind: "ok", value: { ...stock, version: 2 } });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito senior");
  await userEvent.click(screen.getByText("Ajustes").element());
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editRole).mock.calls.length).toBe(1);
  expect(services.editRole).toHaveBeenCalledWith("role-stock", {
    name: "Depósito senior",
    permissionKeys: ["view_stock_balances", "adjust_stock"],
    version: 1,
  });
  await expect.poll(() => window.location.pathname).toBe("/settings/roles");
  expect(screen.getByRole("dialog").query()).toBeNull();
  window.history.pushState(null, "", "/");
});

test("opens the authorization modal on authorization_required, then authorizes and retries the save", async () => {
  window.history.pushState(null, "", "/settings/roles/role-stock/edit");
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stock });
  vi.mocked(services.editRole).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.editRole).mockResolvedValueOnce({
    kind: "ok",
    value: { ...stock, version: 2 },
  });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");

  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Autorizá este cambio" })).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.editRole).mock.calls.length).toBe(2);
  await expect.poll(() => window.location.pathname).toBe("/settings/roles");
  window.history.pushState(null, "", "/");
});

test("cancelling the authorization modal keeps the typed edit exactly as it was, with no error", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stock });
  vi.mocked(services.editRole).mockResolvedValue({ kind: "authorization_required" });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito senior");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Autorizá este cambio" })).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito senior");
  expect(screen.getByText("No se pudo guardar el rol").query()).toBeNull();
});

test("shows name_taken as a field error and keeps the form", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stock });
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

test("shows an error inside the authorization modal, not calling editRole again, when the browser cancels the passkey ceremony", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stock });
  vi.mocked(services.editRole).mockResolvedValue({ kind: "authorization_required" });
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockRejectedValue(new Error("NotAllowedError"));
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.element(dialog.getByText("No se pudo confirmar con tu passkey")).toBeVisible();
  expect(services.editRole).toHaveBeenCalledTimes(1);
});

test("ends the session when authorizing finds it closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stock });
  vi.mocked(services.editRole).mockResolvedValue({ kind: "authorization_required" });
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  const dialog = screen.getByRole("dialog");

  await userEvent.click(dialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("shows a stale_version notice, and Recargar refetches the role so the second save sends the new version", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValueOnce({ kind: "ok", value: stock });
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
  expect(services.editRole).toHaveBeenLastCalledWith("role-stock", {
    name: "Depósito recargado",
    permissionKeys: ["view_stock_balances"],
    version: 5,
  });
});

test("shows a reload-failed notice when Recargar cannot reach the role, and Recargar again refetches", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValueOnce({ kind: "ok", value: stock });
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

test("a rate-limited save shows the wait without offering Recargar, keeping the typed edits", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stock });
  vi.mocked(services.editRole).mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 60 });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito nuevo");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(screen.getByText("Se puede volver a intentar en 1 minuto.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Recargar" }).query()).toBeNull();
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito nuevo");
});

test("a rate-limited Recargar keeps offering Recargar", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValueOnce({ kind: "ok", value: stock });
  vi.mocked(services.editRole).mockResolvedValueOnce({ kind: "stale_version" });
  const screen = await renderScreen(services);
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(screen.getByText("Este rol cambió mientras lo editabas")).toBeVisible();

  vi.mocked(services.fetchRole).mockResolvedValueOnce({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  await userEvent.click(screen.getByRole("button", { name: "Recargar" }));

  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Recargar" })).toBeVisible();
});

test("has no accessibility violations once loaded", async () => {
  const services = createServices();
  vi.mocked(services.fetchRole).mockResolvedValue({ kind: "ok", value: stock });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Editar rol", level: 1 })).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});
