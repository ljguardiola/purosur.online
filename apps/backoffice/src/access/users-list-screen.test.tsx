import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useEffect } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS, accessWith } from "../shell/test-support/backoffice-access";
import { render } from "../shell/test-support/render-with-router";
import { useRefreshAccess } from "./access-queries";
import { type UsersListFilters, usersListFilters } from "./routes";
import type { BranchUser } from "./users-api";
import { UsersListScreen } from "./users-list-screen";
import type { UsersListScreenServices } from "./users-list-services";

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
    vi.mocked(services.fetchRoles).mockResolvedValue({
      kind: "ok",
      value: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          isAdministrator: true,
          name: null,
          permissionKeys: [],
          userCount: 1,
        },
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
  role: { id: "00000000-0000-4000-8000-000000000001", isAdministrator: true, name: null },
  passkeyCount: 2,
  isLastActiveAdministrator: true,
  mayEmitPinCode: true,
};

const martina: BranchUser = {
  id: "user-2",
  firstName: "Martina Gómez",
  email: "martina@example.com",
  version: 1,
  role: { id: "00000000-0000-4000-8000-000000000001", isAdministrator: true, name: null },
  passkeyCount: 1,
  isLastActiveAdministrator: false,
  mayEmitPinCode: true,
};

const tomas: BranchUser = {
  id: "user-3",
  firstName: "Tomás Ruiz",
  email: "tomas@example.com",
  version: 1,
  role: {
    id: "00000000-0000-4000-8000-000000000002",
    isAdministrator: false,
    name: "Atención de caja",
  },
  passkeyCount: 0,
  isLastActiveAdministrator: false,
  mayEmitPinCode: true,
};

const sofia: BranchUser = {
  id: "user-4",
  firstName: "Sofía Díaz",
  email: "sofia@example.com",
  version: 1,
  active: false,
  role: {
    id: "00000000-0000-4000-8000-000000000002",
    isAdministrator: false,
    name: "Atención de caja",
  },
  passkeyCount: 0,
  isLastActiveAdministrator: false,
  mayEmitPinCode: true,
};

const REACTIVATE_USERS_ACCESS = accessWith("users_area", "reactivate_users");

const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

function grantAuthorization(services: UsersListScreenServices) {
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockResolvedValue(assertion);
  vi.mocked(services.authorizeSession).mockResolvedValue({ kind: "ok" });
}

afterEach(() => {
  window.history.pushState(null, "", "/");
});

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function screenElement(
  services: UsersListScreenServices,
  onSessionEnded: () => void = () => {},
  access: BackofficeAccess = ADMINISTRATOR_ACCESS,
  {
    filters = usersListFilters.parse({}),
    onFiltersChange = () => {},
  }: {
    filters?: UsersListFilters;
    onFiltersChange?: (filters: UsersListFilters) => void;
  } = {},
) {
  return (
    <main>
      <UsersListScreen
        services={services}
        onSessionEnded={onSessionEnded}
        access={access}
        filters={filters}
        onFiltersChange={onFiltersChange}
      />
    </main>
  );
}

function renderScreen(...args: Parameters<typeof screenElement>) {
  return render(screenElement(...args));
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
  window.history.pushState(null, "", "/users");
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator, martina] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 usuarios")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Editar a Martina Gómez" }));

  expect(window.location.pathname).toBe("/users/user-2");
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

test("shows a load error when the roles fail to load, and Reintentar reads again the roles that failed", async () => {
  const services = createServices({
    fetchRoles: vi.fn().mockResolvedValueOnce({ kind: "failed" }),
  });
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir los usuarios")).toBeVisible();

  vi.mocked(services.fetchRoles).mockResolvedValueOnce({
    kind: "ok",
    value: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        isAdministrator: true,
        name: null,
        permissionKeys: [],
        userCount: 1,
      },
    ],
  });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Nuevo usuario" })).toBeEnabled();
  expect(services.fetchUsers).toHaveBeenCalledTimes(1);
  expect(services.fetchRoles).toHaveBeenCalledTimes(2);
});

test("shows the rate-limited notice with a retry action when the roles request is rate limited", async () => {
  const services = createServices({
    fetchRoles: vi.fn().mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 120 }),
  });
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("navigates to Mi cuenta when the roles request comes back forbidden", async () => {
  window.history.pushState(null, "", "/users");
  const services = createServices({
    fetchRoles: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/account");
});

test("ends the session when the users request finds no open session", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("shows the users table loading while the users are on their way", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("table", { name: "Usuarios" }))
    .toHaveAttribute("aria-busy", "true");
});

test("shows an empty state when there are no users yet", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Todavía no hay usuarios")).toBeVisible();
  await expect.element(screen.getByText("0 usuarios")).not.toBeInTheDocument();
});

test("shows a filtered empty state when the Estado filter hides every user", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /^Estado/ }));
  await userEvent.click(screen.getByRole("option", { name: "Inactivos" }));

  await expect.element(screen.getByText("Sin resultados")).toBeVisible();
  await expect.element(screen.getByText("Todavía no hay usuarios")).not.toBeInTheDocument();
  await expect.element(screen.getByText("0 usuarios")).not.toBeInTheDocument();
});

test("retrying a failed load starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<Awaited<ReturnType<typeof services.fetchUsers>>>();
  vi.mocked(services.fetchUsers)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir los usuarios")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("No pudimos abrir los usuarios")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("table", { name: "Usuarios" }))
    .toHaveAttribute("aria-busy", "true");
  retry.resolve({ kind: "ok", value: [administrator] });
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
});

test("Nuevo usuario is disabled while the list loads and after it fails to load", async () => {
  const services = createServices();
  const firstLoad = deferred<Awaited<ReturnType<typeof services.fetchUsers>>>();
  vi.mocked(services.fetchUsers).mockReturnValueOnce(firstLoad.promise);
  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Nuevo usuario" })).toBeDisabled();

  firstLoad.resolve({ kind: "failed" });
  await expect.element(screen.getByText("No pudimos abrir los usuarios")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Nuevo usuario" })).toBeDisabled();
});

test("creating a user reads users and roles again from the server, keeping the shown rows and Nuevo usuario available while it does", async () => {
  const services = createServices();
  const refresh = deferred<Awaited<ReturnType<typeof services.fetchUsers>>>();
  vi.mocked(services.fetchUsers)
    .mockResolvedValueOnce({ kind: "ok", value: [administrator] })
    .mockReturnValueOnce(refresh.promise);
  vi.mocked(services.createUser).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");

  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect
    .element(screen.getByRole("table", { name: "Usuarios" }))
    .toHaveAttribute("aria-busy", "true");
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(screen.getByText("Lucas Guardiola").query()).not.toBeNull();
  await expect.element(screen.getByRole("button", { name: "Nuevo usuario" })).toBeEnabled();
  refresh.resolve({ kind: "ok", value: [administrator, martina] });
  await expect.element(screen.getByText("2 usuarios")).toBeVisible();
  expect(services.fetchUsers).toHaveBeenCalledTimes(2);
  expect(services.fetchRoles).toHaveBeenCalledTimes(2);
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
        {
          id: "00000000-0000-4000-8000-000000000001",
          isAdministrator: true,
          name: null,
          permissionKeys: [],
          userCount: 1,
        },
        {
          id: "00000000-0000-4000-8000-000000000004",
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

  vi.mocked(services.createUser).mockResolvedValue({ kind: "ok" });
  vi.mocked(services.fetchUsers).mockResolvedValueOnce({
    kind: "ok",
    value: [administrator, martina],
  });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.poll(() => vi.mocked(services.createUser).mock.calls.length).toBe(1);
  expect(services.createUser).toHaveBeenCalledWith({
    first_name: "Martina Gómez",
    email: "martina@example.com",
    role_id: "00000000-0000-4000-8000-000000000001",
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
  vi.mocked(services.createUser).mockResolvedValueOnce({ kind: "ok" });
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

  await expect.element(dialog.getByText("Revisá el correo.")).toBeVisible();
});

test("rejects an email longer than any address can be, without calling the API", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(
    dialog.getByRole("textbox", { name: /^Correo/ }),
    `${"a".repeat(250)}@example.com`,
  );
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.element(dialog.getByText("Ingresá un correo válido.")).toBeVisible();
  expect(services.createUser).not.toHaveBeenCalled();
});

test("shows a server validation_failed error for the name on Nombre", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  vi.mocked(services.createUser).mockResolvedValue({
    kind: "validation_failed",
    field: "first_name",
  });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.element(dialog.getByText("Revisá el nombre.")).toBeVisible();
  expect(dialog.getByText("Ingresá el nombre.").query()).toBeNull();
});

test("shows the generic failure notice when the cloud refuses a field the form does not have", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  vi.mocked(services.createUser).mockResolvedValue({ kind: "validation_failed", field: "other" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.element(dialog.getByText("No se pudo crear el usuario")).toBeVisible();
});

test("shows a server validation_failed error for the role on Rol", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  vi.mocked(services.createUser).mockResolvedValue({ kind: "validation_failed", field: "role_id" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect
    .element(dialog.getByText("Ese rol ya no está disponible. Elegí otro."))
    .toBeVisible();
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
        filters={usersListFilters.parse({})}
        onFiltersChange={() => {}}
      />
    </main>,
  );

  await expect.element(dialog.getByRole("button", { name: /^Administrador Rol/ })).toBeVisible();
  expect(services.fetchUsers).toHaveBeenCalledTimes(1);

  vi.mocked(services.createUser).mockResolvedValue({ kind: "ok" });
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.poll(() => vi.mocked(services.createUser).mock.calls.length).toBe(1);
  expect(vi.mocked(services.createUser).mock.calls[0]?.[0]).toEqual({
    first_name: "Martina Gómez",
    email: "martina@example.com",
    role_id: "00000000-0000-4000-8000-000000000001",
  });
});

function RefreshProbe({ onReady }: { onReady: (refresh: () => Promise<void>) => void }) {
  const refreshAccess = useRefreshAccess();
  useEffect(() => onReady(refreshAccess));
  return null;
}

test("a refresh of the roles in the background does not overwrite what is typed in the create modal", async () => {
  const services = createServices();
  const administratorRole = {
    id: "00000000-0000-4000-8000-000000000001",
    isAdministrator: true,
    name: null,
    permissionKeys: [],
    userCount: 1,
  };
  const refreshedUsers = deferred<Awaited<ReturnType<typeof services.fetchUsers>>>();
  vi.mocked(services.fetchUsers)
    .mockResolvedValueOnce({ kind: "ok", value: [administrator] })
    .mockReturnValueOnce(refreshedUsers.promise);
  vi.mocked(services.fetchRoles)
    .mockResolvedValueOnce({ kind: "ok", value: [administratorRole] })
    .mockResolvedValueOnce({
      kind: "ok",
      value: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          isAdministrator: false,
          name: "Cajero",
          permissionKeys: [],
          userCount: 0,
        },
        administratorRole,
      ],
    });
  let refreshAccess: () => Promise<void> = () => Promise.resolve();
  const screen = await render(
    <main>
      <RefreshProbe
        onReady={(refresh) => {
          refreshAccess = refresh;
        }}
      />
      <UsersListScreen
        services={services}
        onSessionEnded={() => {}}
        access={ADMINISTRATOR_ACCESS}
        filters={usersListFilters.parse({})}
        onFiltersChange={() => {}}
      />
    </main>,
  );
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");

  void refreshAccess();
  await expect.poll(() => vi.mocked(services.fetchRoles).mock.calls.length).toBe(2);
  refreshedUsers.resolve({ kind: "ok", value: [administrator, martina] });

  await expect.element(screen.getByText("2 usuarios")).toBeVisible();
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");

  await expect
    .element(dialog.getByRole("textbox", { name: /^Nombre/ }))
    .toHaveValue("Martina Gómez");
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
  window.history.pushState(null, "", "/users");
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  vi.mocked(services.createUser).mockResolvedValue({ kind: "forbidden" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Martina Gómez");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "martina@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect.poll(() => window.location.pathname).toBe("/account");
  expect(services.fetchSessionAuthorizationOptions).not.toHaveBeenCalled();
});

test("navigates to Mi cuenta when creating the user retried after the authorization comes back forbidden", async () => {
  window.history.pushState(null, "", "/users");
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

  await expect.poll(() => window.location.pathname).toBe("/account");
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
  window.history.pushState(null, "", "/users");
  const services = createServices({
    fetchRoles: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator, tomas] });

  const screen = await renderScreen(
    services,
    () => {},
    accessWith("users_area", "deactivate_users"),
  );

  await expect.element(screen.getByText("Tomás Ruiz")).toBeVisible();
  expect(screen.getByRole("button", { name: "Nuevo usuario" }).query()).toBeNull();
  expect(services.fetchRoles).not.toHaveBeenCalled();
  expect(window.location.pathname).toBe("/users");
});

test("offers a view action, not an edit one, to reach a user's detail for a non-Administrator holding only deactivate_users", async () => {
  window.history.pushState(null, "", "/users");
  const services = createServices({
    fetchRoles: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [tomas] });

  const screen = await renderScreen(
    services,
    () => {},
    accessWith("users_area", "deactivate_users"),
  );

  await userEvent.click(screen.getByRole("button", { name: "Ver a Tomás Ruiz" }));
  expect(screen.getByRole("button", { name: "Editar a Tomás Ruiz" }).query()).toBeNull();
  await expect.poll(() => window.location.pathname).toBe("/users/user-3");
});

test("shows an Inactivo tag on a deactivated user's row and none on an active one, for an Administrator", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator, sofia] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("2 usuarios")).toBeVisible();
  await expect.element(screen.getByText("Inactivo")).toBeVisible();
});

test("the Estado filter narrows the list to active or inactive users", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({
    kind: "ok",
    value: [administrator, sofia],
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("2 usuarios")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /^Estado/ }));
  await userEvent.click(screen.getByRole("option", { name: "Inactivos" }));

  await expect.element(screen.getByText("Sofía Díaz")).toBeVisible();
  await expect.element(screen.getByText("Lucas Guardiola")).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /^Estado/ }));
  await userEvent.click(screen.getByRole("option", { name: "Activos" }));

  await expect.element(screen.getByText("Lucas Guardiola")).toBeVisible();
  await expect.element(screen.getByText("Sofía Díaz")).not.toBeInTheDocument();
});

test("hides the Estado filter and column for a non-Administrator without reactivate_users", async () => {
  const services = createServices({
    fetchRoles: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [tomas] });

  const screen = await renderScreen(
    services,
    () => {},
    accessWith("users_area", "deactivate_users"),
  );

  await expect.element(screen.getByText("Tomás Ruiz")).toBeVisible();
  expect(screen.getByRole("button", { name: /^Estado/ }).query()).toBeNull();
});

test("lets a reactivate-only holder open the list and reach an inactive user's detail, never reading the roles", async () => {
  window.history.pushState(null, "", "/users");
  const services = createServices({
    fetchRoles: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator, sofia] });

  const screen = await renderScreen(services, () => {}, REACTIVATE_USERS_ACCESS);

  await expect.element(screen.getByText("Sofía Díaz")).toBeVisible();
  await expect.element(screen.getByText("Inactivo")).toBeVisible();
  expect(services.fetchRoles).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole("button", { name: "Ver a Sofía Díaz" }));

  await expect.poll(() => window.location.pathname).toBe("/users/user-4");
});

test("on a duplicate deactivated email, shows the reactivation notice and a Reactivar button, disabling Crear el usuario", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  vi.mocked(services.createUser).mockResolvedValue({
    kind: "email_belongs_to_deactivated_user",
    id: "user-4",
    name: "Sofía Díaz",
  });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Sofía Díaz");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "sofia@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await expect
    .element(dialog.getByText("Ese correo pertenece a la cuenta desactivada de Sofía Díaz."))
    .toBeVisible();
  await expect
    .element(dialog.getByRole("button", { name: "Reactivar a Sofía Díaz" }))
    .toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Crear el usuario" })).toBeDisabled();
});

test("editing Correo after a duplicate-deactivated conflict clears the notice and re-enables Crear el usuario", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  vi.mocked(services.createUser).mockResolvedValue({
    kind: "email_belongs_to_deactivated_user",
    id: "user-4",
    name: "Sofía Díaz",
  });
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Sofía Díaz");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "sofia@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));
  await expect
    .element(dialog.getByRole("button", { name: "Reactivar a Sofía Díaz" }))
    .toBeVisible();

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "otra@example.com");

  await expect
    .element(dialog.getByRole("button", { name: "Reactivar a Sofía Díaz" }))
    .not.toBeInTheDocument();
  await expect
    .element(dialog.getByText("Ese correo pertenece a la cuenta desactivada de Sofía Díaz."))
    .not.toBeInTheDocument();
  await expect.element(dialog.getByRole("button", { name: "Crear el usuario" })).toBeEnabled();
});

test("Reactivar a X in the create modal closes it and navigates to that user's detail", async () => {
  window.history.pushState(null, "", "/users");
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("1 usuario")).toBeVisible();
  const dialog = await openNewUserModal(screen);
  vi.mocked(services.createUser).mockResolvedValue({
    kind: "email_belongs_to_deactivated_user",
    id: "user-4",
    name: "Sofía Díaz",
  });
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Nombre/ }), "Sofía Díaz");
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "sofia@example.com");
  await userEvent.click(dialog.getByRole("button", { name: "Crear el usuario" }));

  await userEvent.click(dialog.getByRole("button", { name: "Reactivar a Sofía Díaz" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => window.location.pathname).toBe("/users/user-4");
});

test("opens on the state it is given", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator, sofia] });

  const screen = await renderScreen(services, () => {}, ADMINISTRATOR_ACCESS, {
    filters: { state: "inactive" },
  });

  await expect.element(screen.getByText("Sofía Díaz")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: /^Estado: Inactivos/ })).toBeVisible();
  expect(screen.getByText("Lucas Guardiola").query()).toBeNull();
});

test("reports every change to its state filter, so it can be kept for a reload", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator, sofia] });
  const onFiltersChange = vi.fn();
  const screen = await renderScreen(services, () => {}, ADMINISTRATOR_ACCESS, { onFiltersChange });
  await expect.element(screen.getByText("2 usuarios")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: /^Estado/ }));
  await userEvent.click(screen.getByRole("option", { name: "Activos", exact: true }));

  expect(onFiltersChange).toHaveBeenLastCalledWith({ state: "active" });
});

test("does not report its filters again when the route hands it a new callback", async () => {
  const services = createServices();
  vi.mocked(services.fetchUsers).mockResolvedValue({ kind: "ok", value: [administrator, sofia] });
  const onFiltersChange = vi.fn();
  const filters = usersListFilters.parse({});
  const screen = await renderScreen(services, () => {}, ADMINISTRATOR_ACCESS, {
    filters,
    onFiltersChange,
  });
  await expect.element(screen.getByText("2 usuarios")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: /^Estado/ }));
  await userEvent.click(screen.getByRole("option", { name: "Activos", exact: true }));
  await expect.poll(() => onFiltersChange.mock.calls.length).toBe(1);

  await screen.rerender(
    screenElement(services, () => {}, ADMINISTRATOR_ACCESS, {
      filters,
      onFiltersChange: (reported) => onFiltersChange(reported),
    }),
  );

  expect(onFiltersChange).toHaveBeenCalledTimes(1);
});
