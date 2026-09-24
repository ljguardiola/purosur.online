import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { NewRoleScreen, type NewRoleScreenServices } from "./NewRoleScreen";

function createServices(overrides: Partial<NewRoleScreenServices> = {}): NewRoleScreenServices {
  return {
    fetchRoleCreationChallenge: vi.fn(),
    createRole: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const reauthenticationOptions = { challenge: "reauth" } as never;
const reauthAssertion = { id: "existing-cred" } as never;

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
      <NewRoleScreen isAdministrator services={services} onSessionEnded={onSessionEnded} />
    </main>,
  );
}

test("shows a forbidden notice, without calling the API, for a non-Administrator", async () => {
  const services = createServices();

  const screen = await render(
    <main>
      <NewRoleScreen isAdministrator={false} services={services} onSessionEnded={() => {}} />
    </main>,
  );

  await expect.element(screen.getByText("No tenés acceso a Roles")).toBeVisible();
  expect(services.fetchRoleCreationChallenge).not.toHaveBeenCalled();
});

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

test("tells the Administrator their passkey is asked to confirm saving", async () => {
  const services = createServices();

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Se pide tu passkey para confirmar.")).toBeVisible();
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
  expect(services.fetchRoleCreationChallenge).not.toHaveBeenCalled();

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Administrador");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect
    .element(screen.getByText("Ese nombre es del Administrador; elegí otro."))
    .toBeVisible();
  expect(services.fetchRoleCreationChallenge).not.toHaveBeenCalled();
});

test("Cancelar navigates back to the roles list without calling the API", async () => {
  window.history.pushState(null, "", "/settings/roles/new");
  const services = createServices();
  const screen = await renderScreen(services);

  await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

  expect(window.location.pathname).toBe("/settings/roles");
  expect(services.fetchRoleCreationChallenge).not.toHaveBeenCalled();
  window.history.pushState(null, "", "/");
});

test("creates the role through the passkey step-up and returns to the roles list", async () => {
  window.history.pushState(null, "", "/settings/roles/new");
  const services = createServices();
  vi.mocked(services.fetchRoleCreationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.createRole).mockResolvedValue({ kind: "ok", value: createdRole });
  const screen = await renderScreen(services);

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByText("Ver saldos").element());
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.poll(() => vi.mocked(services.createRole).mock.calls.length).toBe(1);
  expect(services.createRole).toHaveBeenCalledWith(
    { name: "Depósito", permissionKeys: ["view_stock_balances"] },
    reauthAssertion,
  );
  await expect.poll(() => window.location.pathname).toBe("/settings/roles");
  window.history.pushState(null, "", "/");
});

test("shows name_taken as a field error on Nombre del rol and keeps the form", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoleCreationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.createRole).mockResolvedValue({ kind: "name_taken" });
  const screen = await renderScreen(services);

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.element(screen.getByText("Ya existe un rol con este nombre.")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Nuevo rol", level: 1 })).toBeVisible();
});

test("shows a notice, not calling createRole, when the passkey prompt is cancelled", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoleCreationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockRejectedValue(new Error("NotAllowedError"));
  const screen = await renderScreen(services);

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.element(screen.getByText("No se pudo crear el rol")).toBeVisible();
  expect(services.createRole).not.toHaveBeenCalled();
});

test("shows a rate-limited notice when creation-options is rate limited", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoleCreationChallenge).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const screen = await renderScreen(services);

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("ends the session when creation-options finds the session already ended", async () => {
  const services = createServices();
  vi.mocked(services.fetchRoleCreationChallenge).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);

  await userEvent.fill(screen.getByRole("textbox", { name: /^Nombre del rol/ }), "Depósito");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el rol" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("has no accessibility violations", async () => {
  const services = createServices();
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Nuevo rol", level: 1 })).toBeVisible();

  await expectNoAccessibilityViolations(document.body);
});
