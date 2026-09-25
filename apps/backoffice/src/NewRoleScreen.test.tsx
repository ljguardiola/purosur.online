import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { NewRoleScreen, type NewRoleScreenServices } from "./NewRoleScreen";

function createServices(overrides: Partial<NewRoleScreenServices> = {}): NewRoleScreenServices {
  return {
    createRole: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

/** Sets up an already-granted passkey authorization, for a test that isn't about that ceremony itself. */
function grantAuthorization(services: NewRoleScreenServices) {
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
}

const createdRole = {
  id: "role-stock",
  name: "Depósito",
  isAdministrator: false,
  permissionKeys: ["view_stock_balances"],
  userCount: 0,
};

function renderScreen(services: NewRoleScreenServices, onSessionEnded: () => void = () => {}) {
  return render(
    <main>
      <NewRoleScreen services={services} onSessionEnded={onSessionEnded} />
    </main>,
  );
}

test("shows the breadcrumb, heading, name field, and every permission area with a starting 0 count", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Configuración · Roles")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Nuevo rol", level: 1 })).toBeVisible();
  await expect.element(screen.getByRole("textbox", { name: /^Nombre del rol/ })).toHaveValue("");
  await expect.element(screen.getByText("Caja · con PIN de otra persona").first()).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Si quien está en la caja no tiene el permiso, lo autoriza con su PIN alguien que sí lo tenga.",
      ),
    )
    .toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Crear y editar roles, dar de alta usuarios y asignarles un rol queda solo para el Administrador.",
      ),
    )
    .toBeVisible();
  await expect
    .element(
      screen.getByText("Vender y cobrar, incluido pesar a mano y abrir y cerrar su propia sesión"),
    )
    .toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Alertas 0 de 3", level: 2 }))
    .toBeVisible();
  await expect.element(screen.getByRole("radio", { name: "No ve alertas" })).toBeChecked();
});

test("shows no advance notice about a passkey before the save is attempted", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  expect(screen.getByText("Se pide tu passkey para confirmar.").query()).toBeNull();
});

test("checking a permission shows its register badge and updates its area's count", async () => {
  const services = createServices();
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("0 de 7")).toBeVisible();

  // The accessible "checkbox" role resolves to react-aria's visually hidden native <input>; the
  // visible pointer target is the label's own text content, same convention as Checkbox.test.tsx.
  await userEvent.click(screen.getByText("Reimprimir un ticket").element());

  await expect.element(screen.getByText("1 de 7")).toBeVisible();
  await expect
    .element(screen.getByRole("checkbox", { name: /Caja · con PIN de otra persona/ }))
    .toBeVisible();
});

test("choosing an alerts radio option and the manual-dismiss checkbox counts both toward the Alertas area", async () => {
  const services = createServices();
  const screen = await renderScreen(services);

  // The accessible "radio"/"checkbox" role resolves to react-aria's visually hidden native
  // <input>; the visible pointer target is the label's own text content, same convention as
  // RadioGroup.test.tsx and Checkbox.test.tsx.
  await userEvent.click(screen.getByText("Ver alertas del local").element());
  await expect
    .element(screen.getByRole("heading", { name: "Alertas 1 de 3", level: 2 }))
    .toBeVisible();

  await userEvent.click(screen.getByText("Cerrar alertas a mano").element());
  await expect
    .element(screen.getByRole("heading", { name: "Alertas 2 de 3", level: 2 }))
    .toBeVisible();

  await userEvent.click(screen.getByText("Ver todas las alertas").element());
  await expect
    .element(screen.getByRole("heading", { name: "Alertas 2 de 3", level: 2 }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("radio", { name: "Ver alertas del local" }))
    .not.toBeChecked();
});

test("requires a non-empty name that is not the Administrator's own, without calling the API", async () => {
  const services = createServices();
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.element(screen.getByText("Ingresá el nombre del rol.")).toBeVisible();
  expect(services.createRole).not.toHaveBeenCalled();

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Administrador");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect
    .element(screen.getByText("Ese nombre es del Administrador; elegí otro."))
    .toBeVisible();
  expect(services.createRole).not.toHaveBeenCalled();
});

test("rejects a name longer than 100 characters, without calling the API", async () => {
  const services = createServices();
  const screen = await renderScreen(services);

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "a".repeat(101));
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect
    .element(screen.getByText("El nombre puede tener hasta 100 caracteres."))
    .toBeVisible();
  expect(services.createRole).not.toHaveBeenCalled();
});

test("Cancelar navigates back to the roles list without calling the API", async () => {
  window.history.pushState(null, "", "/settings/roles/new");
  const services = createServices();
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

  expect(window.location.pathname).toBe("/settings/roles");
  expect(services.createRole).not.toHaveBeenCalled();
  window.history.pushState(null, "", "/");
});

test("creates the role directly, without the authorization modal, when the session already has one", async () => {
  window.history.pushState(null, "", "/settings/roles/new");
  const services = createServices();
  vi.mocked(services.createRole).mockResolvedValue({ kind: "ok", value: createdRole });
  const screen = await renderScreen(services);

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByText("Ver saldos").element());
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.poll(() => vi.mocked(services.createRole).mock.calls.length).toBe(1);
  expect(services.createRole).toHaveBeenCalledWith({
    name: "Depósito",
    permissionKeys: ["view_stock_balances"],
  });
  await expect.poll(() => window.location.pathname).toBe("/settings/roles");
  expect(screen.getByRole("dialog").query()).toBeNull();
  window.history.pushState(null, "", "/");
});

test("opens the authorization modal on authorization_required, then authorizes and retries the save", async () => {
  window.history.pushState(null, "", "/settings/roles/new");
  const services = createServices();
  vi.mocked(services.createRole).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.createRole).mockResolvedValueOnce({ kind: "ok", value: createdRole });
  const screen = await renderScreen(services);

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Autorizá este cambio" })).toBeVisible();
  await expect
    .element(
      dialog.getByText("Guardar un rol necesita tu autorización. Confirmala con tu passkey."),
    )
    .toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.createRole).mock.calls.length).toBe(2);
  await expect.poll(() => window.location.pathname).toBe("/settings/roles");
  window.history.pushState(null, "", "/");
});

test("cancelling the authorization modal keeps the form exactly as it was, with no error", async () => {
  const services = createServices();
  vi.mocked(services.createRole).mockResolvedValue({ kind: "authorization_required" });
  const screen = await renderScreen(services);
  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));
  const dialog = screen.getByRole("dialog");
  await expect.element(dialog.getByRole("heading", { name: "Autorizá este cambio" })).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre del rol/ }))
    .toHaveValue("Depósito");
  expect(screen.getByText("No se pudo crear el rol").query()).toBeNull();
  expect(services.createRole).toHaveBeenCalledTimes(1);
});

test("shows name_taken as a field error on Nombre del rol and keeps the form", async () => {
  const services = createServices();
  vi.mocked(services.createRole).mockResolvedValue({ kind: "name_taken" });
  const screen = await renderScreen(services);

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.element(screen.getByText("Ya existe un rol con este nombre.")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Nuevo rol", level: 1 })).toBeVisible();
});

test("shows a rate-limited notice when creating the role is rate limited", async () => {
  const services = createServices();
  vi.mocked(services.createRole).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const screen = await renderScreen(services);

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("ends the session when creating the role finds the session already ended", async () => {
  const services = createServices();
  vi.mocked(services.createRole).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta, without the authorization modal, when saving the role comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/roles/new");
  const services = createServices();
  vi.mocked(services.createRole).mockResolvedValue({ kind: "forbidden" });
  const screen = await renderScreen(services);

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  expect(services.fetchSessionAuthorizationOptions).not.toHaveBeenCalled();
  window.history.pushState(null, "", "/");
});

test("navigates to Mi cuenta when the save retried after the authorization comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/roles/new");
  const services = createServices();
  vi.mocked(services.createRole).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.createRole).mockResolvedValueOnce({ kind: "forbidden" });
  const screen = await renderScreen(services);

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));
  await userEvent.click(
    screen.getByRole("dialog").getByRole("button", { name: "Usar mi passkey" }),
  );

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("has no accessibility violations", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Nuevo rol", level: 1 })).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});

test("keeps the heading in view after scrolling the permission form to the bottom", async () => {
  const services = createServices();
  const screen = await render(
    <main style={{ height: "320px" }} className="flex flex-col overflow-hidden">
      <NewRoleScreen services={services} onSessionEnded={() => {}} />
    </main>,
  );

  const heading = screen.getByRole("heading", { name: "Nuevo rol", level: 1 });
  await expect.element(heading).toBeVisible();
  const headingTopBefore = heading.element().getBoundingClientRect().top;

  const main = heading.element().closest("main") as HTMLElement;
  const body = main.children[1] as HTMLElement;
  expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
  body.scrollTop = body.scrollHeight;

  await expect.element(heading).toBeVisible();
  expect(heading.element().getBoundingClientRect().top).toBe(headingTopBefore);
});
