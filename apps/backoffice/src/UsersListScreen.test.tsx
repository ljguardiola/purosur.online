import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { UsersListScreen, type UsersListScreenServices } from "./UsersListScreen";
import type { BranchUser } from "./usersApi";

function createServices(overrides: Partial<UsersListScreenServices> = {}): UsersListScreenServices {
  return {
    fetchUsers: vi.fn(),
    fetchUserCreationChallenge: vi.fn(),
    createUser: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

const administrator: BranchUser = {
  id: "user-1",
  firstName: "Lucas Guardiola",
  email: "lucas@example.com",
  version: 1,
  role: { id: "role-admin", isAdministrator: true, name: null },
  passkeyCount: 2,
};

const martina: BranchUser = {
  id: "user-2",
  firstName: "Martina Gómez",
  email: "martina@example.com",
  version: 1,
  role: { id: "role-admin", isAdministrator: true, name: null },
  passkeyCount: 1,
};

const tomas: BranchUser = {
  id: "user-3",
  firstName: "Tomás Ruiz",
  email: "tomas@example.com",
  version: 1,
  role: { id: "role-shift", isAdministrator: false, name: "Atención de caja" },
  passkeyCount: 0,
};

const reauthenticationOptions = { challenge: "reauth" } as never;
const reauthAssertion = { id: "existing-cred" } as never;

function renderScreen(services: UsersListScreenServices, onSessionEnded: () => void = () => {}) {
  return render(
    <main>
      <UsersListScreen isAdministrator services={services} onSessionEnded={onSessionEnded} />
    </main>,
  );
}

test("shows the breadcrumb, heading, each user's role, and the user count", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator, martina] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Configuración")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Usuarios", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Lucas Guardiola")).toBeVisible();
  await expect.element(screen.getByText("lucas@example.com")).toBeVisible();
  await expect.element(screen.getByText("Martina Gómez")).toBeVisible();
  await expect.element(screen.getByText("Administrador").first()).toBeVisible();
  await expect.element(screen.getByText("2 usuarios")).toBeVisible();
});

test("shows each user's passkey count as plain text, with the plural, singular and none forms", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({
    kind: "ok",
    value: [administrator, martina, tomas],
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Passkeys")).toBeVisible();
  await expect.element(screen.getByText("2 registradas")).toBeVisible();
  await expect.element(screen.getByText("1 registrada")).toBeVisible();
  await expect.element(screen.getByText("—")).toBeVisible();
});

test("shows no passkey helper line: a single passkey is a normal state and nothing knows who only uses the register", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({
    kind: "ok",
    value: [administrator, martina, tomas],
  });

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 registrada")).toBeVisible();

  expect(screen.getByText("Conviene agregar otra").query()).toBeNull();
  expect(screen.getByText("Solo usa la caja").query()).toBeNull();
});

test("the row action navigates to that user's detail screen", async () => {
  window.history.pushState(null, "", "/settings/users");
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator, martina] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 usuarios")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Editar a Martina Gómez" }));

  expect(window.location.pathname).toBe("/settings/users/user-2");
  window.history.pushState(null, "", "/");
});

test("shows a load error with a retry action when the users fail to load", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir los usuarios")).toBeVisible();

  vi.mocked(services.fetchUsers).mockResolvedValueOnce({ kind: "ok", value: [administrator] });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("1 usuario")).toBeVisible();
});

test("ends the session when the users request finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("shows a forbidden notice, without calling the API, for a non-Administrator", async () => {
  const services = createServices();

  const screen = await render(
    <main>
      <UsersListScreen isAdministrator={false} services={services} onSessionEnded={() => {}} />
    </main>,
  );

  await expect.element(screen.getByText("No tenés acceso a Usuarios")).toBeVisible();
  expect(services.fetchUsers).not.toHaveBeenCalled();
});

async function openNewUserModal(screen: Awaited<ReturnType<typeof renderScreen>>) {
  await userEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
  return screen.getByRole("dialog");
}

test("opens the create modal preselecting the only role, and cancel closes it without calling the API", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();

  const dialog = await openNewUserModal(screen);

  await expect.element(dialog.getByRole("heading", { name: "Nuevo usuario" })).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: /^Administrador Rol/ })).toBeVisible();
  await expect.element(dialog.getByText("Se pide tu passkey para confirmar.")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.fetchUserCreationChallenge).not.toHaveBeenCalled();
  expect(services.createUser).not.toHaveBeenCalled();
});

test("creates a user through options, passkey and create, and shows it in the list", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValueOnce({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);

  vi.mocked(services.fetchUserCreationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.createUser).mockResolvedValue({ kind: "ok", value: martina });
  vi.mocked(services.fetchUsers).mockResolvedValueOnce({
    kind: "ok",
    value: [administrator, martina],
  });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.poll(() => vi.mocked(services.createUser).mock.calls.length).toBe(1);
  expect(services.createUser).toHaveBeenCalledWith(
    { firstName: "Martina Gómez", email: "martina@example.com", roleId: "role-admin" },
    reauthAssertion,
  );
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Martina Gómez")).toBeVisible();
  await expect.element(screen.getByText("2 usuarios")).toBeVisible();
});

test("requires name and email before submitting, without calling the API", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.element(dialog.getByText("Ingresá el nombre.")).toBeVisible();
  await expect.element(dialog.getByText("Ingresá el correo.")).toBeVisible();
  expect(services.fetchUserCreationChallenge).not.toHaveBeenCalled();

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "no-es-un-correo");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.element(dialog.getByText("Ingresá un correo válido.")).toBeVisible();
  expect(services.fetchUserCreationChallenge).not.toHaveBeenCalled();
});

test("shows email_taken on Correo and keeps the modal open", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  vi.mocked(services.fetchUserCreationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.createUser).mockResolvedValue({ kind: "email_taken" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.element(dialog.getByText("Ya existe un usuario con este correo.")).toBeVisible();
  await expect.element(screen.getByRole("dialog")).toBeVisible();
});

test("shows a server validation_failed error on the named field", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  vi.mocked(services.fetchUserCreationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.createUser).mockResolvedValue({ kind: "validation_failed", field: "email" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.element(dialog.getByText("Ingresá un correo válido.")).toBeVisible();
});

test("shows a server validation_failed error for the role on Rol", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  vi.mocked(services.fetchUserCreationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.createUser).mockResolvedValue({ kind: "validation_failed", field: "roleId" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.element(dialog.getByText("Elegí un rol.")).toBeVisible();
  await expect.element(screen.getByRole("dialog")).toBeVisible();
});

test("keeps the loaded list and an open create modal when the parent re-renders with a new onSessionEnded", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services, () => {});
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");

  await screen.rerender(
    <main>
      <UsersListScreen isAdministrator services={services} onSessionEnded={() => {}} />
    </main>,
  );

  await expect.element(dialog.getByRole("button", { name: /^Administrador Rol/ })).toBeVisible();
  expect(services.fetchUsers).toHaveBeenCalledTimes(1);

  vi.mocked(services.fetchUserCreationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.createUser).mockResolvedValue({ kind: "ok", value: martina });
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.poll(() => vi.mocked(services.createUser).mock.calls.length).toBe(1);
  expect(vi.mocked(services.createUser).mock.calls[0]?.[0]).toEqual({
    firstName: "Martina Gómez",
    email: "martina@example.com",
    roleId: "role-admin",
  });
});

test("keeps the modal open with a notice when the passkey prompt is cancelled", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  vi.mocked(services.fetchUserCreationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockRejectedValue(new Error("NotAllowedError"));

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.element(dialog.getByText("No se pudo crear el usuario")).toBeVisible();
  expect(services.createUser).not.toHaveBeenCalled();
});

test("shows a notice when the chosen role is no longer valid", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  vi.mocked(services.fetchUserCreationChallenge).mockResolvedValue({
    kind: "ok",
    value: { reauthenticationOptions },
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(reauthAssertion);
  vi.mocked(services.createUser).mockResolvedValue({ kind: "unknown_role" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.element(dialog.getByText("Ese rol ya no está disponible")).toBeVisible();
});

test("ends the session when creation-options finds the session already ended", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  vi.mocked(services.fetchUserCreationChallenge).mockResolvedValue({ kind: "unauthenticated" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("has no accessibility violations once loaded, and with the create modal open", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await openNewUserModal(screen);
  await expectNoAccessibilityViolations(document.body);
});
