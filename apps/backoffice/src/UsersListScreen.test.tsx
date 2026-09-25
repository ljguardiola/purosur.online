import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import type { BackofficeAccess } from "./access";
import { UsersListScreen, type UsersListScreenServices } from "./UsersListScreen";
import type { BranchUser } from "./usersApi";

const ADMINISTRATOR_ACCESS: BackofficeAccess = { isAdministrator: true, permissions: [] };

function createServices(overrides: Partial<UsersListScreenServices> = {}): UsersListScreenServices {
  const services: UsersListScreenServices = {
    fetchUsers: vi.fn(),
    fetchRoles: vi.fn(),
    createUser: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
  if (!overrides.fetchRoles) {
    // Every existing test exercises a single Administrator; only a test about the role selector
    // itself needs to override this with a different roster.
    vi.mocked(services.fetchRoles).mockResolvedValue({
      kind: "ok",
      value: [
        { id: "role-admin", isAdministrator: true, name: null, permissionKeys: [], userCount: 1 },
      ],
    });
  }
  return services;
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

const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

/** Sets up an already-granted passkey authorization, for a test that isn't about that ceremony itself. */
function grantAuthorization(services: UsersListScreenServices) {
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
}

function renderScreen(
  services: UsersListScreenServices,
  onSessionEnded: () => void = () => {},
  access: BackofficeAccess = ADMINISTRATOR_ACCESS,
) {
  return render(
    <main>
      <UsersListScreen services={services} onSessionEnded={onSessionEnded} access={access} />
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

test("shows a load error when the roles fail to load, and Reintentar reloads both users and roles", async () => {
  const services = createServices({
    fetchRoles: vi.fn().mockResolvedValueOnce({ kind: "failed" }),
  });
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir los usuarios")).toBeVisible();

  vi.mocked(services.fetchRoles).mockResolvedValueOnce({
    kind: "ok",
    value: [
      { id: "role-admin", isAdministrator: true, name: null, permissionKeys: [], userCount: 1 },
    ],
  });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Nuevo usuario" })).toBeEnabled();
  expect(services.fetchUsers).toHaveBeenCalledTimes(2);
  expect(services.fetchRoles).toHaveBeenCalledTimes(2);
});

test("shows the rate-limited notice with a retry action when the roles request is rate limited", async () => {
  const services = createServices({
    fetchRoles: vi.fn().mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 120 }),
  });
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("navigates to Mi cuenta when the roles request comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/users");
  const services = createServices({
    fetchRoles: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
});

test("ends the session when the users request finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
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
  expect(dialog.getByText("Se pide tu passkey para confirmar.").query()).toBeNull();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.createUser).not.toHaveBeenCalled();
});

test("shows no helper line under Correo in the create modal", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();

  const dialog = await openNewUserModal(screen);

  await expect
    .element(dialog.getByRole("textbox", { name: /^Correo/ }))
    .not.toHaveAccessibleDescription();
});

test("offers a role held by no users yet in the create-user selector", async () => {
  const services = createServices({
    fetchRoles: vi.fn().mockResolvedValue({
      kind: "ok",
      value: [
        { id: "role-admin", isAdministrator: true, name: null, permissionKeys: [], userCount: 1 },
        {
          id: "role-stock",
          isAdministrator: false,
          name: "Depósito",
          permissionKeys: [],
          userCount: 0,
        },
      ],
    }),
  });
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();

  const dialog = await openNewUserModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: /^Administrador Rol/ }));
  await expect.element(dialog.getByRole("option", { name: "Depósito" })).toBeVisible();
});

test("creates a user directly, without the authorization modal, when the session already has one", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValueOnce({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);

  vi.mocked(services.createUser).mockResolvedValue({ kind: "ok", value: martina });
  vi.mocked(services.fetchUsers).mockResolvedValueOnce({
    kind: "ok",
    value: [administrator, martina],
  });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.poll(() => vi.mocked(services.createUser).mock.calls.length).toBe(1);
  expect(services.createUser).toHaveBeenCalledWith({
    firstName: "Martina Gómez",
    email: "martina@example.com",
    roleId: "role-admin",
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Martina Gómez")).toBeVisible();
  await expect.element(screen.getByText("2 usuarios")).toBeVisible();
});

test("opens the authorization modal on authorization_required, then authorizes and retries the creation", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValueOnce({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);

  vi.mocked(services.createUser).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.createUser).mockResolvedValueOnce({ kind: "ok", value: martina });
  vi.mocked(services.fetchUsers).mockResolvedValueOnce({
    kind: "ok",
    value: [administrator, martina],
  });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await expect
    .element(
      authDialog.getByText("Crear un usuario necesita tu autorización. Confirmala con tu passkey."),
    )
    .toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.createUser).mock.calls.length).toBe(2);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Martina Gómez")).toBeVisible();
});

test("cancelling the authorization modal keeps the create-user form open with its values, with no error", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  vi.mocked(services.createUser).mockResolvedValue({ kind: "authorization_required" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Cancelar" }));

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Autorizá este cambio" }).query())
    .toBeNull();
  await expect.element(screen.getByRole("dialog", { name: "Nuevo usuario" })).toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Martina Gómez");
  expect(screen.getByText("No se pudo crear el usuario").query()).toBeNull();
  expect(services.createUser).toHaveBeenCalledTimes(1);
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
  expect(services.createUser).not.toHaveBeenCalled();

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "no-es-un-correo");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.element(dialog.getByText("Ingresá un correo válido.")).toBeVisible();
  expect(services.createUser).not.toHaveBeenCalled();
});

test("shows email_taken on Correo and keeps the modal open", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
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
      <UsersListScreen
        services={services}
        onSessionEnded={() => {}}
        access={ADMINISTRATOR_ACCESS}
      />
    </main>,
  );

  await expect.element(dialog.getByRole("button", { name: /^Administrador Rol/ })).toBeVisible();
  expect(services.fetchUsers).toHaveBeenCalledTimes(1);

  vi.mocked(services.createUser).mockResolvedValue({ kind: "ok", value: martina });
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.poll(() => vi.mocked(services.createUser).mock.calls.length).toBe(1);
  expect(vi.mocked(services.createUser).mock.calls[0]?.[0]).toEqual({
    firstName: "Martina Gómez",
    email: "martina@example.com",
    roleId: "role-admin",
  });
});

test("shows an error inside the authorization modal, not calling createUser again, when the browser cancels the passkey ceremony", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  vi.mocked(services.createUser).mockResolvedValue({ kind: "authorization_required" });
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockRejectedValue(new Error("NotAllowedError"));

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.element(authDialog.getByText("No se pudo confirmar con tu passkey")).toBeVisible();
  expect(services.createUser).toHaveBeenCalledTimes(1);
});

test("shows a notice when the chosen role is no longer valid", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  vi.mocked(services.createUser).mockResolvedValue({ kind: "unknown_role" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.element(dialog.getByText("Ese rol ya no está disponible")).toBeVisible();
});

test("ends the session when creating the user finds the session already ended", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  vi.mocked(services.createUser).mockResolvedValue({ kind: "unauthenticated" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("ends the session when authorizing finds the session already ended", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  vi.mocked(services.createUser).mockResolvedValue({ kind: "authorization_required" });
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "unauthenticated",
  });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta, without the authorization modal, when creating the user comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/users");
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  vi.mocked(services.createUser).mockResolvedValue({ kind: "forbidden" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  expect(services.fetchSessionAuthorizationOptions).not.toHaveBeenCalled();
  window.history.pushState(null, "", "/");
});

test("navigates to Mi cuenta when creating the user retried after the authorization comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/users");
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  vi.mocked(services.createUser).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.createUser).mockResolvedValueOnce({ kind: "forbidden" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Autorizá este cambio" })
      .getByRole("button", { name: "Usar mi passkey" }),
  );

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  window.history.pushState(null, "", "/");
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

test("hides Nuevo usuario for a non-Administrator holding only deactivate_users", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator, tomas] });

  const screen = await renderScreen(services, () => {}, {
    isAdministrator: false,
    permissions: ["deactivate_users"],
  });

  await expect.element(screen.getByText("Tomás Ruiz")).toBeVisible();
  expect(screen.getByRole("button", { name: "Nuevo usuario" }).query()).toBeNull();
});

test("still offers the row action to reach a user's detail for a non-Administrator holding only deactivate_users", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [tomas] });

  const screen = await renderScreen(services, () => {}, {
    isAdministrator: false,
    permissions: ["deactivate_users"],
  });

  await expect.element(screen.getByRole("button", { name: "Editar a Tomás Ruiz" })).toBeVisible();
});
