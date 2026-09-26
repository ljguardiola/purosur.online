import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import type { BackofficeAccess } from "./access";
import type { RoleSummary } from "./rolesApi";
import { UserDetailScreen, type UserDetailScreenServices } from "./UserDetailScreen";
import type { BranchUser, UserPasskey } from "./usersApi";

const ADMINISTRATOR_ACCESS: BackofficeAccess = { isAdministrator: true, permissions: [] };

const shiftRole: RoleSummary = {
  id: "role-shift",
  isAdministrator: false,
  name: "Responsable de turno",
  permissionKeys: [],
  userCount: 1,
};
const cashierRole: RoleSummary = {
  id: "role-cashier",
  isAdministrator: false,
  name: "Cajero",
  permissionKeys: [],
  userCount: 0,
};
const administratorRole: RoleSummary = {
  id: "role-admin",
  isAdministrator: true,
  name: null,
  permissionKeys: [],
  userCount: 1,
};

function createServices(
  overrides: Partial<UserDetailScreenServices> = {},
): UserDetailScreenServices {
  const services: UserDetailScreenServices = {
    fetchUser: vi.fn(),
    editUser: vi.fn(),
    fetchRoles: vi.fn(),
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    removeUserPasskey: vi.fn(),
    deactivateUser: vi.fn(),
    reactivateUser: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
  if (!overrides.fetchRoles) {
    vi.mocked(services.fetchRoles).mockResolvedValue({
      kind: "ok",
      value: [administratorRole, shiftRole, cashierRole],
    });
  }
  return services;
}

const lucia: BranchUser = {
  id: "user-1",
  firstName: "Lucía",
  email: "lucia.perez@purosur.online",
  version: 1,
  role: shiftRole,
  passkeyCount: 1,
  isLastActiveAdministrator: false,
};

const NOW = () => new Date("2026-09-23T12:00:00.000Z");

const notebook: UserPasskey = {
  id: "pk-1",
  name: "Notebook del local",
  createdAt: "2026-08-02T12:00:00.000Z",
  // 09:12 in America/Argentina/Buenos_Aires (UTC-3), same calendar day as NOW below.
  lastUsedAt: "2026-09-23T12:12:00.000Z",
};
const phone: UserPasskey = {
  id: "pk-2",
  name: "Teléfono de Lucía",
  createdAt: "2026-08-10T12:00:00.000Z",
  lastUsedAt: null,
};

const authorizationOptions = { challenge: "session-auth" } as never;
const assertion = { id: "existing-cred" } as never;

/** Sets up an already-granted passkey authorization, for a test that isn't about that ceremony itself. */
function grantAuthorization(services: UserDetailScreenServices) {
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

function renderScreen(
  services: UserDetailScreenServices,
  onSessionEnded: () => void = () => {},
  userId = "user-1",
  signedInUserId = "admin-1",
  access: BackofficeAccess = ADMINISTRATOR_ACCESS,
) {
  return render(
    <main>
      <UserDetailScreen
        userId={userId}
        signedInUserId={signedInUserId}
        access={access}
        now={NOW}
        services={services}
        onSessionEnded={onSessionEnded}
      />
    </main>,
  );
}

test("shows the breadcrumb, heading, and the Datos section's role and email", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Configuración · Usuarios")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Responsable de turno")).toBeVisible();
  await expect.element(screen.getByText("lucia.perez@purosur.online")).toBeVisible();
  expect(services.fetchUser).toHaveBeenCalledWith("user-1");
});

test("shows a not-found state for a missing or other-branch id, without calling the API twice", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "not_found" });

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("alert")).toHaveTextContent("No encontramos este usuario");
  expect(services.fetchUser).toHaveBeenCalledTimes(1);
});

test("navigates to Mi cuenta when the user read comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/users/user-1");
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
});

test("shows a load error, and Reintentar loads the user again", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir este usuario")).toBeVisible();

  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "ok", value: lucia });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  expect(services.fetchUser).toHaveBeenCalledTimes(2);
});

test("shows a rate-limited notice with the minutes to wait when loading is rate limited", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 120 });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("ends the session when loading the user finds it closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

async function openEditModal(screen: Awaited<ReturnType<typeof renderScreen>>) {
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  return screen.getByRole("dialog", { name: "Lucía" });
}

test("opens the edit modal with Correo prefilled, with no advance notice about a passkey, and Cancelar closes it without calling the API", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();

  const dialog = await openEditModal(screen);

  await expect
    .element(dialog.getByRole("textbox", { name: /^Correo/ }))
    .toHaveValue("lucia.perez@purosur.online");
  await expect
    .element(dialog.getByRole("button", { name: /^Responsable de turno Rol/ }))
    .toBeVisible();
  expect(
    dialog
      .getByText("Al guardar, el navegador te pide usar tu passkey para confirmar el cambio.")
      .query(),
  ).toBeNull();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.editUser).not.toHaveBeenCalled();
});

test("lists every role and lets picking a different one change the Rol selector's value", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: /^Responsable de turno Rol/ }));
  await expect.element(screen.getByRole("option", { name: "Administrador" })).toBeVisible();
  await expect.element(screen.getByRole("option", { name: "Cajero" })).toBeVisible();
  await userEvent.click(screen.getByRole("option", { name: "Cajero" }));

  await expect.element(dialog.getByRole("button", { name: /^Cajero Rol/ })).toBeVisible();
});

test("saves the newly picked role together with the email", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  const updated: BranchUser = { ...lucia, role: cashierRole, version: 2 };
  vi.mocked(services.editUser).mockResolvedValue({ kind: "ok", value: updated });

  await userEvent.click(dialog.getByRole("button", { name: /^Responsable de turno Rol/ }));
  await userEvent.click(screen.getByRole("option", { name: "Cajero" }));
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editUser).mock.calls.length).toBe(1);
  expect(services.editUser).toHaveBeenCalledWith("user-1", {
    email: "lucia.perez@purosur.online",
    roleId: "role-cashier",
    version: 1,
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Cajero")).toBeVisible();
});

test("shows no Select, but a locked Rol field with a keyboard-focusable lock and its tooltip, for the last active Administrator", async () => {
  const lastAdmin: BranchUser = {
    ...lucia,
    role: administratorRole,
    isLastActiveAdministrator: true,
  };
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lastAdmin });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);

  expect(dialog.getByRole("button", { name: /Rol$/ }).query()).toBeNull();
  await expect.element(dialog.getByText("Administrador")).toBeVisible();
  const lock = dialog.getByRole("button", { name: "Por qué el rol está fijo" });
  await expect.element(lock).toBeVisible();

  // The modal is wider than the default phone-sized browser-mode viewport, which would leave the
  // lock (near the field's right edge) outside it and unhoverable (see Tooltip.test.tsx's own
  // comment on the same constraint applied to another portaled overlay).
  await page.viewport(1280, 900);
  await userEvent.hover(lock);
  await expect.element(screen.getByRole("tooltip")).toBeVisible();
  await expect
    .element(screen.getByRole("tooltip"))
    .toHaveTextContent(
      "Es el único Administrador activo. Para cambiarle el rol, primero hacé Administrador a otra persona.",
    );

  await page.viewport(414, 896);
});

test("shows a last_administrator notice with a reload action when the server still refuses the role change", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  vi.mocked(services.editUser).mockResolvedValue({ kind: "last_administrator" });

  await userEvent.click(dialog.getByRole("button", { name: /^Responsable de turno Rol/ }));
  await userEvent.click(screen.getByRole("option", { name: "Cajero" }));
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Ahora es el único Administrador activo")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Recargar" })).toBeVisible();
});

test("shows an unknown-role notice when the server rejects the chosen role", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  vi.mocked(services.editUser).mockResolvedValue({ kind: "validation_failed", field: "roleId" });

  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Ese rol ya no está disponible")).toBeVisible();
});

test("shows no helper line under Correo in the edit modal", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();

  const dialog = await openEditModal(screen);

  await expect
    .element(dialog.getByRole("textbox", { name: /^Correo/ }))
    .not.toHaveAccessibleDescription();
});

test("changes the email directly, without the authorization modal, when the session already has one", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  const updated: BranchUser = { ...lucia, email: "nueva@purosur.online", version: 2 };
  vi.mocked(services.editUser).mockResolvedValue({ kind: "ok", value: updated });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editUser).mock.calls.length).toBe(1);
  expect(services.editUser).toHaveBeenCalledWith("user-1", {
    email: "nueva@purosur.online",
    roleId: "role-shift",
    version: 1,
  });
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("nueva@purosur.online")).toBeVisible();
});

test("opens the authorization modal on authorization_required, then authorizes and retries the change", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  const updated: BranchUser = { ...lucia, email: "nueva@purosur.online", version: 2 };
  vi.mocked(services.editUser).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.editUser).mockResolvedValueOnce({ kind: "ok", value: updated });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await expect
    .element(
      authDialog.getByText(
        "Editar un usuario necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.editUser).mock.calls.length).toBe(2);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("nueva@purosur.online")).toBeVisible();
});

test("cancelling the authorization modal keeps the edit modal open with its typed value, with no error", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  vi.mocked(services.editUser).mockResolvedValue({ kind: "authorization_required" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Cancelar" }));

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Autorizá este cambio" }).query())
    .toBeNull();
  await expect.element(screen.getByRole("dialog", { name: "Lucía" })).toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: /^Correo/ }))
    .toHaveValue("nueva@purosur.online");
  expect(screen.getByText("No se pudo guardar el cambio").query()).toBeNull();
  expect(services.editUser).toHaveBeenCalledTimes(1);
});

test("shows email_taken on Correo and keeps the modal open", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  vi.mocked(services.editUser).mockResolvedValue({ kind: "email_taken" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "tomada@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Ya existe un usuario con este correo.")).toBeVisible();
  await expect.element(screen.getByRole("dialog")).toBeVisible();
});

test("shows an error inside the authorization modal, not calling editUser again, when the browser cancels the passkey ceremony", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  vi.mocked(services.editUser).mockResolvedValue({ kind: "authorization_required" });
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockRejectedValue(new Error("NotAllowedError"));

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.element(authDialog.getByText("No se pudo confirmar con tu passkey")).toBeVisible();
  expect(services.editUser).toHaveBeenCalledTimes(1);
});

test("ends the session when authorizing the email change finds it closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  vi.mocked(services.editUser).mockResolvedValue({ kind: "authorization_required" });
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "unauthenticated",
  });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("ends the session when the change itself finds it closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  vi.mocked(services.editUser).mockResolvedValue({ kind: "unauthenticated" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta, without the authorization modal, when the email change comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/users/user-1");
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  vi.mocked(services.editUser).mockResolvedValue({ kind: "forbidden" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  expect(services.fetchSessionAuthorizationOptions).not.toHaveBeenCalled();
});

test("navigates to Mi cuenta when the email change retried after the authorization comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/users/user-1");
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  vi.mocked(services.editUser).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.editUser).mockResolvedValueOnce({ kind: "forbidden" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Autorizá este cambio" })
      .getByRole("button", { name: "Usar mi passkey" }),
  );

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
});

test("shows a rate-limited notice when the change is rate limited", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  vi.mocked(services.editUser).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
});

test("shows a server-rejected email on Correo", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  vi.mocked(services.editUser).mockResolvedValue({
    kind: "validation_failed",
    field: "email",
  });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Ingresá un correo válido.")).toBeVisible();
});

test("shows a server-rejected version as a failed notice, leaving Correo without an error", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  vi.mocked(services.editUser).mockResolvedValue({
    kind: "validation_failed",
    field: "version",
  });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("No se pudo guardar el cambio")).toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Correo/ }))
    .not.toHaveAttribute("aria-invalid", "true");
});

test("shows a stale_version notice, and Recargar refetches the user so the second save sends the new version", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  vi.mocked(services.editUser).mockResolvedValueOnce({ kind: "stale_version" });

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.element(dialog.getByText("Este usuario cambió mientras lo editabas")).toBeVisible();

  const reloaded: BranchUser = { ...lucia, email: "otra@purosur.online", version: 5 };
  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "ok", value: reloaded });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect
    .element(dialog.getByRole("textbox", { name: /^Correo/ }))
    .toHaveValue("otra@purosur.online");
  await expect
    .poll(() => dialog.getByText("Este usuario cambió mientras lo editabas").query())
    .toBeNull();

  const updated: BranchUser = { ...reloaded, email: "final@purosur.online", version: 6 };
  vi.mocked(services.editUser).mockResolvedValueOnce({ kind: "ok", value: updated });
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "final@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => vi.mocked(services.editUser).mock.calls.length).toBe(2);
  expect(vi.mocked(services.editUser).mock.calls[1]).toEqual([
    "user-1",
    { email: "final@purosur.online", roleId: "role-shift", version: 5 },
  ]);
});

async function openStaleModal(services: UserDetailScreenServices) {
  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  vi.mocked(services.editUser).mockResolvedValueOnce({ kind: "stale_version" });
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));
  await expect.element(dialog.getByText("Este usuario cambió mientras lo editabas")).toBeVisible();
  return { screen, dialog };
}

test("shows a reload-failed notice when Recargar cannot reach the user, and Recargar again refetches", async () => {
  const services = createServices();
  const { dialog } = await openStaleModal(services);

  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "failed" });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.element(dialog.getByText("No se pudieron recargar los datos")).toBeVisible();
  expect(dialog.getByText("No se pudo guardar el cambio").query()).toBeNull();

  const reloaded: BranchUser = { ...lucia, email: "otra@purosur.online", version: 5 };
  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "ok", value: reloaded });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect
    .element(dialog.getByRole("textbox", { name: /^Correo/ }))
    .toHaveValue("otra@purosur.online");
  expect(services.fetchUser).toHaveBeenCalledTimes(3);
});

test("shows a rate-limited notice when Recargar is rate limited, keeping Recargar available", async () => {
  const services = createServices();
  const { dialog } = await openStaleModal(services);

  vi.mocked(services.fetchUser).mockResolvedValueOnce({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Recargar" })).toBeEnabled();
});

test("shows the screen's not-found state when Recargar finds the user gone", async () => {
  const services = createServices();
  const { screen, dialog } = await openStaleModal(services);

  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "not_found" });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByRole("alert")).toHaveTextContent("No encontramos este usuario");
});

test("navigates to Mi cuenta when Recargar comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/users/user-1");
  const services = createServices();
  const { screen, dialog } = await openStaleModal(services);

  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "forbidden" });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
});

test("disables Recargar and Guardar while the reload is pending", async () => {
  const services = createServices();
  const { dialog } = await openStaleModal(services);

  vi.mocked(services.fetchUser).mockReturnValueOnce(new Promise(() => {}));
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect.element(dialog.getByRole("button", { name: "Recargar" })).toBeDisabled();
  await expect.element(dialog.getByRole("button", { name: "Guardar los cambios" })).toBeDisabled();
});

test("has no accessibility violations once loaded, and with the edit modal open", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await openEditModal(screen);
  await expectNoAccessibilityViolations(document.body);
});

test("keeps the loaded screen and an open edit modal with its typed email when the parent re-renders with a new onSessionEnded", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services, () => {});
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");

  await screen.rerender(
    <main>
      <UserDetailScreen
        userId="user-1"
        signedInUserId="admin-1"
        access={ADMINISTRATOR_ACCESS}
        services={services}
        onSessionEnded={() => {}}
      />
    </main>,
  );

  await expect
    .element(screen.getByRole("dialog").getByRole("textbox", { name: /^Correo/ }))
    .toHaveValue("nueva@purosur.online");
  expect(services.fetchUser).toHaveBeenCalledTimes(1);
});

test("lists the user's passkeys with their registration and last-use detail, once Datos loads", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({
    kind: "ok",
    value: [notebook, phone],
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  await expect
    .element(screen.getByText("Registrada el 02/08/2026 · último uso hoy 09:12"))
    .toBeVisible();
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  await expect.element(screen.getByText("Registrada el 10/08/2026")).toBeVisible();
  expect(services.fetchUserPasskeys).toHaveBeenCalledWith("user-1");
});

test("shows a minimal empty state when the user has no passkeys, without the single-passkey account notice", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({ kind: "ok", value: [] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No tiene ninguna passkey registrada.")).toBeVisible();
  expect(screen.getByRole("alert").query()).toBeNull();
});

test("shows a load error with a retry action when the passkeys fail to load, without affecting Datos", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValueOnce({ kind: "failed" });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir las passkeys")).toBeVisible();
  await expect.element(screen.getByText("Responsable de turno")).toBeVisible();

  vi.mocked(services.fetchUserPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook] });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  expect(services.fetchUser).toHaveBeenCalledTimes(1);
});

test("shows a rate-limited notice for the passkeys list", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("ends the session when the passkeys list finds it closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();

  await renderScreen(services, onSessionEnded);

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta when the passkeys list comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/users/user-1");
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({ kind: "forbidden" });

  await renderScreen(services);

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
});

test("shows no remove button on the signed-in Administrator's own passkeys", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({
    kind: "ok",
    value: [notebook, phone],
  });

  const screen = await renderScreen(services, () => {}, "user-1", "user-1");

  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  expect(
    screen.getByRole("button", { name: `Dar de baja la passkey «${notebook.name}»` }).query(),
  ).toBeNull();
});

test("shows no remove button on the Administrator's own passkeys when the id arrives in another case", async () => {
  const signedInUserId = "3f2b8c1e-9d4a-4e6b-8a7c-1b2d3e4f5a6b";
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({
    kind: "ok",
    value: { ...lucia, id: signedInUserId },
  });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({
    kind: "ok",
    value: [notebook, phone],
  });

  const screen = await renderScreen(
    services,
    () => {},
    signedInUserId.toUpperCase(),
    signedInUserId,
  );

  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  expect(
    screen.getByRole("button", { name: `Dar de baja la passkey «${notebook.name}»` }).query(),
  ).toBeNull();
});

async function openRemoveModal(screen: Awaited<ReturnType<typeof renderScreen>>, name: string) {
  await userEvent.click(screen.getByRole("button", { name: `Dar de baja la passkey «${name}»` }));
  return screen.getByRole("dialog", { name: "¿Dar de baja la passkey de Lucía?" });
}

test("opens the remove modal titled and worded for the target user and passkey", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({
    kind: "ok",
    value: [notebook, phone],
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();

  const dialog = await openRemoveModal(screen, "Notebook del local");

  await expect
    .element(dialog.getByRole("heading", { name: "¿Dar de baja la passkey de Lucía?" }))
    .toBeVisible();
  await expect
    .element(dialog.getByText("«Notebook del local» deja de servir para entrar."))
    .toBeVisible();
  expect(dialog.getByText(/Es su única passkey/).query()).toBeNull();
});

test("shows the only-passkey sentence only when it is the user's last passkey", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();

  const dialog = await openRemoveModal(screen, "Notebook del local");

  await expect
    .element(
      dialog.getByText(
        "«Notebook del local» deja de servir para entrar. Es su única passkey: para volver a entrar, Lucía va a tener que pedir el enlace de recuperación por correo.",
      ),
    )
    .toBeVisible();
});

test("removes a passkey directly, without the authorization modal, dropping the row on success", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValueOnce({
    kind: "ok",
    value: [notebook, phone],
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  vi.mocked(services.removeUserPasskey).mockResolvedValue({ kind: "ok" });
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.poll(() => vi.mocked(services.removeUserPasskey).mock.calls.length).toBe(1);
  expect(services.removeUserPasskey).toHaveBeenCalledWith("user-1", "pk-1");
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(screen.getByText("Notebook del local").query()).toBeNull();
});

test("opens the authorization modal on authorization_required, then authorizes and retries the removal", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValueOnce({
    kind: "ok",
    value: [notebook, phone],
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  vi.mocked(services.removeUserPasskey).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.removeUserPasskey).mockResolvedValueOnce({ kind: "ok" });
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await expect
    .element(
      authDialog.getByText(
        "Dar de baja una passkey necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.removeUserPasskey).mock.calls.length).toBe(2);
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(screen.getByText("Notebook del local").query()).toBeNull();
});

test("cancelling the authorization modal keeps the remove modal open, removing nothing", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  vi.mocked(services.removeUserPasskey).mockResolvedValue({ kind: "authorization_required" });
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Cancelar" }));

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Autorizá este cambio" }).query())
    .toBeNull();
  await expect
    .element(screen.getByRole("dialog", { name: "¿Dar de baja la passkey de Lucía?" }))
    .toBeVisible();
  expect(services.removeUserPasskey).toHaveBeenCalledTimes(1);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
});

test("Cancelar closes the remove modal without calling the remove API", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.removeUserPasskey).not.toHaveBeenCalled();
});

test("treats a removal 404 as already gone, dropping the row", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValueOnce({ kind: "ok", value: [notebook] });
  vi.mocked(services.removeUserPasskey).mockResolvedValue({ kind: "not_found" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(screen.getByText("Notebook del local").query()).toBeNull();
});

test("shows an error inside the authorization modal, not calling removeUserPasskey again, when the browser cancels the passkey ceremony", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  vi.mocked(services.removeUserPasskey).mockResolvedValue({ kind: "authorization_required" });
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "ok",
    value: authorizationOptions,
  });
  vi.mocked(services.startAuthentication).mockRejectedValue(new Error("NotAllowedError"));
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.element(authDialog.getByText("No se pudo confirmar con tu passkey")).toBeVisible();
  expect(services.removeUserPasskey).toHaveBeenCalledTimes(1);
});

test("ends the session when authorizing the removal finds it already closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  vi.mocked(services.removeUserPasskey).mockResolvedValue({ kind: "authorization_required" });
  vi.mocked(services.fetchSessionAuthorizationOptions).mockResolvedValue({
    kind: "unauthenticated",
  });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("ends the session when removing finds it already closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  vi.mocked(services.removeUserPasskey).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta, without the authorization modal, when removing the passkey comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/users/user-1");
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  vi.mocked(services.removeUserPasskey).mockResolvedValue({ kind: "forbidden" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  expect(services.fetchSessionAuthorizationOptions).not.toHaveBeenCalled();
});

test("navigates to Mi cuenta when the removal retried after the authorization comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/users/user-1");
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  vi.mocked(services.removeUserPasskey).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.removeUserPasskey).mockResolvedValueOnce({ kind: "forbidden" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));
  await userEvent.click(
    screen
      .getByRole("dialog", { name: "Autorizá este cambio" })
      .getByRole("button", { name: "Usar mi passkey" }),
  );

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
});

test("has no accessibility violations with the passkeys section loaded and the remove modal open", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({
    kind: "ok",
    value: [notebook, phone],
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  await expectNoAccessibilityViolations(document.body);

  await openRemoveModal(screen, "Notebook del local");
  await expectNoAccessibilityViolations(document.body);
});

const DEACTIVATE_USERS_ACCESS: BackofficeAccess = {
  isAdministrator: false,
  permissions: ["deactivate_users"],
};
const NO_DEACTIVATE_ACCESS: BackofficeAccess = { isAdministrator: false, permissions: [] };

const adminTarget: BranchUser = {
  id: "user-4",
  firstName: "Ana Fernández",
  email: "ana@purosur.online",
  version: 1,
  role: { id: "role-admin", isAdministrator: true, name: null },
  passkeyCount: 1,
  isLastActiveAdministrator: false,
};

const REACTIVATE_USERS_ACCESS: BackofficeAccess = {
  isAdministrator: false,
  permissions: ["reactivate_users"],
};

const sofia: BranchUser = {
  id: "user-5",
  firstName: "Sofía Díaz",
  email: "sofia.diaz@purosur.online",
  version: 1,
  active: false,
  role: shiftRole,
  passkeyCount: 1,
  isLastActiveAdministrator: false,
};

test("hides Editar and the whole Passkeys section for a non-Administrator, never reading the passkeys", async () => {
  window.history.pushState(null, "", "/settings/users/user-1");
  // The passkeys read is Administrator-only on the cloud: were the screen to ask for it, this
  // viewer would be sent to Mi cuenta instead of staying on the user.
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(
    services,
    () => {},
    "user-1",
    "user-2",
    DEACTIVATE_USERS_ACCESS,
  );

  await expect.element(screen.getByRole("button", { name: "Desactivar a Lucía" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Editar" }).query()).toBeNull();
  expect(screen.getByRole("heading", { name: "Passkeys" }).query()).toBeNull();
  expect(services.fetchUserPasskeys).not.toHaveBeenCalled();
  expect(window.location.pathname).toBe("/settings/users/user-1");
});

test("shows the Desactivar row for an Administrator viewer against a non-Administrator target", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("button", { name: "Desactivar a Lucía" })).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Al desactivar a Lucía, deja de poder entrar a la caja y al backoffice; su historial queda igual.",
      ),
    )
    .toBeVisible();
});

test("lets a non-Administrator holding deactivate_users deactivate the user, back to Usuarios on success", async () => {
  window.history.pushState(null, "", "/settings/users/user-1");
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.deactivateUser).mockResolvedValue({ kind: "ok" });

  const screen = await renderScreen(
    services,
    () => {},
    "user-1",
    "user-2",
    DEACTIVATE_USERS_ACCESS,
  );
  const dialog = await openDeactivateModal(screen);
  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.poll(() => vi.mocked(services.deactivateUser).mock.calls.length).toBe(1);
  expect(services.deactivateUser).toHaveBeenCalledWith("user-1");
  await expect.poll(() => window.location.pathname).toBe("/settings/users");
  expect(services.fetchUserPasskeys).not.toHaveBeenCalled();
});

test("hides the Desactivar row on the viewer's own account, even when its id arrives in another case", async () => {
  const signedInUserId = "3f2b8c1e-9d4a-4e6b-8a7c-1b2d3e4f5a6b";
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({
    kind: "ok",
    value: { ...lucia, id: signedInUserId },
  });

  const screen = await renderScreen(
    services,
    () => {},
    signedInUserId.toUpperCase(),
    signedInUserId,
    DEACTIVATE_USERS_ACCESS,
  );

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  expect(screen.getByRole("button", { name: "Desactivar a Lucía" }).query()).toBeNull();
});

test("hides the Desactivar row for a non-Administrator without deactivate_users", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services, () => {}, "user-1", "user-2", NO_DEACTIVATE_ACCESS);

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  expect(screen.getByRole("button", { name: "Desactivar a Lucía" }).query()).toBeNull();
});

test("hides the Desactivar row against an Administrator target, even for an Administrator viewer", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: adminTarget });

  const screen = await renderScreen(services);

  await expect
    .element(screen.getByRole("heading", { name: "Ana Fernández", level: 1 }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Desactivar a Ana Fernández" }).query()).toBeNull();
});

async function openDeactivateModal(screen: Awaited<ReturnType<typeof renderScreen>>) {
  await userEvent.click(screen.getByRole("button", { name: "Desactivar a Lucía" }));
  return screen.getByRole("dialog", { name: "¿Desactivar a Lucía?" });
}

test("opens the deactivate modal, and Cancelar closes it without calling the API", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();

  const dialog = await openDeactivateModal(screen);
  await expect.element(dialog.getByText("No se puede deshacer.")).toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.deactivateUser).not.toHaveBeenCalled();
});

test("deactivates directly, without the authorization modal, navigating back to Usuarios on success", async () => {
  window.history.pushState(null, "", "/settings/users/user-1");
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.deactivateUser).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openDeactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.poll(() => vi.mocked(services.deactivateUser).mock.calls.length).toBe(1);
  expect(services.deactivateUser).toHaveBeenCalledWith("user-1");
  await expect.poll(() => window.location.pathname).toBe("/settings/users");
});

test("opens the authorization modal on authorization_required, then authorizes and retries the deactivation", async () => {
  window.history.pushState(null, "", "/settings/users/user-1");
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.deactivateUser).mockResolvedValueOnce({ kind: "authorization_required" });
  grantAuthorization(services);
  vi.mocked(services.deactivateUser).mockResolvedValueOnce({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openDeactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();
  await expect
    .element(
      authDialog.getByText(
        "Desactivar un usuario necesita tu autorización. Confirmala con tu passkey.",
      ),
    )
    .toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Usar mi passkey" }));

  await expect.poll(() => vi.mocked(services.deactivateUser).mock.calls.length).toBe(2);
  await expect.poll(() => window.location.pathname).toBe("/settings/users");
});

test("cancelling the authorization modal keeps the deactivate modal open, deactivating nothing", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.deactivateUser).mockResolvedValue({ kind: "authorization_required" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openDeactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));
  const authDialog = screen.getByRole("dialog", { name: "Autorizá este cambio" });
  await expect.element(authDialog).toBeVisible();

  await userEvent.click(authDialog.getByRole("button", { name: "Cancelar" }));

  await expect
    .poll(() => screen.getByRole("dialog", { name: "Autorizá este cambio" }).query())
    .toBeNull();
  await expect.element(screen.getByRole("dialog", { name: "¿Desactivar a Lucía?" })).toBeVisible();
  expect(services.deactivateUser).toHaveBeenCalledTimes(1);
});

test("treats a deactivation 404 as an already-vanished target, showing the not-found state", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.deactivateUser).mockResolvedValue({ kind: "not_found" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openDeactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByRole("alert")).toHaveTextContent("No encontramos este usuario");
});

test("ends the session when deactivating finds it already closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.deactivateUser).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openDeactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta, without the authorization modal, when deactivating comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/users/user-1");
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.deactivateUser).mockResolvedValue({ kind: "forbidden" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openDeactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  expect(services.fetchSessionAuthorizationOptions).not.toHaveBeenCalled();
});

test("shows a rate-limited notice inside the deactivate modal", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.deactivateUser).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openDeactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("shows an attempt-failed notice inside the deactivate modal on any other failure", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.deactivateUser).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openDeactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.element(dialog.getByText("No se pudo desactivar el usuario")).toBeVisible();
});

test("has no accessibility violations with the deactivate modal open", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();

  await openDeactivateModal(screen);
  await expectNoAccessibilityViolations(document.body);
});

test("shows the Inactivo tag, hides Editar, Desactivar and passkey removal, and offers Reactivar, for an inactive user", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 1 })).toBeVisible();
  await expect.element(screen.getByText("Inactivo")).toBeVisible();
  expect(screen.getByRole("button", { name: "Editar" }).query()).toBeNull();
  expect(screen.getByRole("button", { name: "Desactivar a Sofía Díaz" }).query()).toBeNull();
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Dar de baja la passkey «Notebook del local»" }).query(),
  ).toBeNull();
  await expect
    .element(screen.getByRole("button", { name: "Reactivar a Sofía Díaz" }))
    .toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Al reactivar a Sofía Díaz, vuelve a entrar a la caja y al backoffice con su misma cuenta: mismo correo, rol y passkeys.",
      ),
    )
    .toBeVisible();
});

test("shows no Inactivo tag and no Reactivar row for an active user", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  expect(screen.getByText("Inactivo").query()).toBeNull();
  expect(screen.getByRole("button", { name: "Reactivar a Lucía" }).query()).toBeNull();
});

test("lets a reactivate-only holder reach an inactive user's Reactivar row, hiding Editar and Passkeys, never reading roles or passkeys", async () => {
  window.history.pushState(null, "", "/settings/users/user-5");
  const services = createServices({
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "forbidden" }),
  });
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });

  const screen = await renderScreen(
    services,
    () => {},
    "user-5",
    "user-2",
    REACTIVATE_USERS_ACCESS,
  );

  await expect
    .element(screen.getByRole("button", { name: "Reactivar a Sofía Díaz" }))
    .toBeVisible();
  expect(screen.getByRole("button", { name: "Editar" }).query()).toBeNull();
  expect(screen.getByRole("heading", { name: "Passkeys" }).query()).toBeNull();
  expect(services.fetchRoles).not.toHaveBeenCalled();
  expect(services.fetchUserPasskeys).not.toHaveBeenCalled();
});

test("hides the Reactivar row for a non-Administrator without reactivate_users", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });

  const screen = await renderScreen(services, () => {}, "user-5", "user-2", NO_DEACTIVATE_ACCESS);

  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 1 })).toBeVisible();
  expect(screen.getByRole("button", { name: "Reactivar a Sofía Díaz" }).query()).toBeNull();
});

async function openReactivateModal(screen: Awaited<ReturnType<typeof renderScreen>>) {
  await userEvent.click(screen.getByRole("button", { name: "Reactivar a Sofía Díaz" }));
  return screen.getByRole("dialog", { name: "¿Reactivar a Sofía Díaz?" });
}

test("opens the reactivate modal, and Cancelar closes it without calling the API", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 1 })).toBeVisible();

  const dialog = await openReactivateModal(screen);
  await expect
    .element(
      dialog.getByText(
        "Vuelve a entrar a la caja y al backoffice con su mismo correo, rol y passkeys.",
      ),
    )
    .toBeVisible();

  await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(services.reactivateUser).not.toHaveBeenCalled();
});

test("reactivates directly, without the authorization modal, showing the user as active again", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "ok", value: sofia });
  vi.mocked(services.reactivateUser).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 1 })).toBeVisible();
  const dialog = await openReactivateModal(screen);

  vi.mocked(services.fetchUser).mockResolvedValueOnce({
    kind: "ok",
    value: { ...sofia, active: true },
  });
  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect.poll(() => vi.mocked(services.reactivateUser).mock.calls.length).toBe(1);
  expect(services.reactivateUser).toHaveBeenCalledWith("user-5");
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  expect(screen.getByText("Inactivo").query()).toBeNull();
  await expect
    .element(screen.getByRole("button", { name: "Desactivar a Sofía Díaz" }))
    .toBeVisible();
});

test("opens the authorization modal for the reactivation action on authorization_required", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });
  vi.mocked(services.reactivateUser).mockResolvedValue({ kind: "authorization_required" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 1 })).toBeVisible();
  const dialog = await openReactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect
    .element(
      screen
        .getByRole("dialog", { name: "Autorizá este cambio" })
        .getByText("Reactivar un usuario necesita tu autorización. Confirmala con tu passkey."),
    )
    .toBeVisible();
});

test("treats a reactivation 404 as already resolved, refetching the user", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "ok", value: sofia });
  vi.mocked(services.reactivateUser).mockResolvedValue({ kind: "not_found" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 1 })).toBeVisible();
  const dialog = await openReactivateModal(screen);

  vi.mocked(services.fetchUser).mockResolvedValueOnce({
    kind: "ok",
    value: { ...sofia, active: true },
  });
  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchUser).mock.calls.length).toBe(2);
  await expect
    .element(screen.getByRole("button", { name: "Desactivar a Sofía Díaz" }))
    .toBeVisible();
  expect(screen.getByText("Inactivo").query()).toBeNull();
});

test("ends the session when reactivating finds it already closed", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });
  vi.mocked(services.reactivateUser).mockResolvedValue({ kind: "unauthenticated" });
  const onSessionEnded = vi.fn();
  const screen = await renderScreen(services, onSessionEnded);
  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 1 })).toBeVisible();
  const dialog = await openReactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect.poll(() => onSessionEnded.mock.calls.length).toBe(1);
});

test("navigates to Mi cuenta, without the authorization modal, when reactivating comes back forbidden", async () => {
  window.history.pushState(null, "", "/settings/users/user-5");
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });
  vi.mocked(services.reactivateUser).mockResolvedValue({ kind: "forbidden" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 1 })).toBeVisible();
  const dialog = await openReactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect.poll(() => window.location.pathname).toBe("/settings/users/me");
  expect(services.fetchSessionAuthorizationOptions).not.toHaveBeenCalled();
});

test("shows a rate-limited notice inside the reactivate modal", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });
  vi.mocked(services.reactivateUser).mockResolvedValue({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 1 })).toBeVisible();
  const dialog = await openReactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect.element(dialog.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(dialog.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
});

test("shows an attempt-failed notice inside the reactivate modal on any other failure", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });
  vi.mocked(services.reactivateUser).mockResolvedValue({ kind: "failed" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 1 })).toBeVisible();
  const dialog = await openReactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect.element(dialog.getByText("No se pudo reactivar el usuario")).toBeVisible();
});

test("has no accessibility violations with the reactivate modal open", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: sofia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 1 })).toBeVisible();

  await openReactivateModal(screen);
  await expectNoAccessibilityViolations(document.body);
});
