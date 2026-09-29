import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { useEffect } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { useRefreshAccess } from "./access-queries";
import type { BackofficeAccess } from "./backoffice-access";
import type { Passkey } from "./passkey-api";
import type { RoleSummary } from "./roles-api";
import { UserDetailScreen } from "./user-detail-screen";
import type { UserDetailScreenServices } from "./user-detail-services";
import type { BranchUser } from "./users-api";

const ADMINISTRATOR_ACCESS: BackofficeAccess = { isAdministrator: true, permissions: [] };

const shiftRole: RoleSummary = {
  id: "00000000-0000-4000-8000-000000000002",
  isAdministrator: false,
  name: "Responsable de turno",
  permissionKeys: [],
  userCount: 1,
};
const cashierRole: RoleSummary = {
  id: "00000000-0000-4000-8000-000000000003",
  isAdministrator: false,
  name: "Cajero",
  permissionKeys: [],
  userCount: 0,
};
const administratorRole: RoleSummary = {
  id: "00000000-0000-4000-8000-000000000001",
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

const notebook: Passkey = {
  id: "pk-1",
  name: "Notebook del local",
  createdAt: "2026-08-02T12:00:00.000Z",
  // 09:12 in America/Argentina/Buenos_Aires (UTC-3), same calendar day as NOW below.
  lastUsedAt: "2026-09-23T12:12:00.000Z",
};
const phone: Passkey = {
  id: "pk-2",
  name: "Teléfono de Lucía",
  createdAt: "2026-08-10T12:00:00.000Z",
  lastUsedAt: null,
};

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

test("shows the load failure when Recargar cannot read the user, and Reintentar reads again without reopening the modal", async () => {
  const services = createServices();
  const { screen } = await openStaleModal(services);

  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "failed" });
  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Recargar" }));

  await expect.element(screen.getByText("No pudimos abrir este usuario")).toBeVisible();
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "ok", value: lucia });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("shows the rate-limited load failure when Recargar is rate limited", async () => {
  const services = createServices();
  const { screen } = await openStaleModal(services);

  vi.mocked(services.fetchUser).mockResolvedValueOnce({
    kind: "rate_limited",
    retryAfterSeconds: 120,
  });
  await userEvent.click(screen.getByRole("dialog").getByRole("button", { name: "Recargar" }));

  await expect.element(screen.getByText("Demasiadas solicitudes")).toBeVisible();
  await expect.element(screen.getByText("Se puede volver a intentar en 2 minutos.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("Recargar reads the user again through the cache once, refreshing every access read", async () => {
  const services = createServices();
  const { dialog } = await openStaleModal(services);

  const reloaded: BranchUser = { ...lucia, email: "otra@purosur.online", version: 5 };
  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "ok", value: reloaded });
  await userEvent.click(dialog.getByRole("button", { name: "Recargar" }));

  await expect
    .element(dialog.getByRole("textbox", { name: /^Correo/ }))
    .toHaveValue("otra@purosur.online");
  expect(services.fetchUser).toHaveBeenCalledTimes(2);
  await expect.poll(() => vi.mocked(services.fetchRoles).mock.calls.length).toBe(2);
  await expect.poll(() => vi.mocked(services.fetchUserPasskeys).mock.calls.length).toBe(2);
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

test("removes a passkey directly, without the authorization modal, reading the list again from the server", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys)
    .mockResolvedValueOnce({ kind: "ok", value: [notebook, phone] })
    .mockResolvedValueOnce({ kind: "ok", value: [phone] });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  vi.mocked(services.removeUserPasskey).mockResolvedValue({ kind: "ok" });
  const dialog = await openRemoveModal(screen, "Notebook del local");

  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect.poll(() => vi.mocked(services.removeUserPasskey).mock.calls.length).toBe(1);
  expect(services.removeUserPasskey).toHaveBeenCalledWith("user-1", "pk-1");
  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => screen.getByText("Notebook del local").query()).toBeNull();
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
  expect(services.fetchUserPasskeys).toHaveBeenCalledTimes(2);
  expect(services.fetchUser).toHaveBeenCalledTimes(2);
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
  role: { id: "00000000-0000-4000-8000-000000000001", isAdministrator: true, name: null },
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

test("while the user loads, shows a disabled Desactivar to someone who may deactivate users", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(
    services,
    () => {},
    "user-1",
    "user-2",
    DEACTIVATE_USERS_ACCESS,
  );

  await expect.element(screen.getByRole("button", { name: "Desactivar" })).toBeDisabled();
});

test("while the user loads, shows a disabled Desactivar to someone who may only reactivate users", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(
    services,
    () => {},
    "user-1",
    "user-2",
    REACTIVATE_USERS_ACCESS,
  );

  await expect.element(screen.getByRole("button", { name: "Desactivar" })).toBeDisabled();
});

test("after the user fails to load, shows Desactivar disabled to someone who may deactivate users", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "failed" });

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("No pudimos abrir este usuario")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Desactivar" })).toBeDisabled();
});

test("while the user loads, shows no Desactivar on the viewer's own account", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services, () => {}, "admin-1", "admin-1");

  await expect.element(screen.getByRole("status").first()).toHaveTextContent("Cargando…");
  expect(screen.getByRole("button", { name: "Desactivar" }).query()).toBeNull();
});

test("while the user loads, shows no Desactivar without deactivate or reactivate permission", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services, () => {}, "user-1", "user-2", NO_DEACTIVATE_ACCESS);

  await expect.element(screen.getByRole("status").first()).toHaveTextContent("Cargando…");
  expect(screen.getByRole("button", { name: "Desactivar" }).query()).toBeNull();
});

async function openDeactivateModal(screen: Awaited<ReturnType<typeof renderScreen>>) {
  await userEvent.click(screen.getByRole("button", { name: "Desactivar a Lucía" }));
  return screen.getByRole("dialog", { name: "¿Desactivar a Lucía?" });
}

test("a deactivation refreshes every access read", async () => {
  window.history.pushState(null, "", "/settings/users/user-1");
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.deactivateUser).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openDeactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.poll(() => vi.mocked(services.fetchRoles).mock.calls.length).toBe(2);
  await expect.poll(() => vi.mocked(services.fetchUserPasskeys).mock.calls.length).toBe(2);
});

test("treats a deactivation 404 as an already-vanished target, reading the user again and showing the not-found state", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser)
    .mockResolvedValueOnce({ kind: "ok", value: lucia })
    .mockResolvedValueOnce({ kind: "not_found" });
  vi.mocked(services.deactivateUser).mockResolvedValue({ kind: "not_found" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openDeactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Desactivar" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByRole("alert")).toHaveTextContent("No encontramos este usuario");
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

test("dates each passkey's last use against the time the passkeys were last loaded", async () => {
  const services = createServices();
  let current = new Date("2026-09-23T12:00:00.000Z");
  vi.mocked(services.fetchUser).mockResolvedValueOnce({ kind: "ok", value: sofia });
  vi.mocked(services.fetchUserPasskeys).mockResolvedValue({ kind: "ok", value: [notebook] });
  vi.mocked(services.reactivateUser).mockResolvedValue({ kind: "ok" });
  const screen = await render(
    <main>
      <UserDetailScreen
        userId="user-5"
        signedInUserId="admin-1"
        access={ADMINISTRATOR_ACCESS}
        now={() => current}
        services={services}
        onSessionEnded={() => {}}
      />
    </main>,
  );
  await expect
    .element(screen.getByText("Registrada el 02/08/2026 · último uso hoy 09:12"))
    .toBeVisible();

  current = new Date("2026-09-24T12:00:00.000Z");
  vi.mocked(services.fetchUser).mockResolvedValueOnce({
    kind: "ok",
    value: { ...sofia, active: true },
  });
  const dialog = await openReactivateModal(screen);
  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect
    .element(screen.getByText("Registrada el 02/08/2026 · último uso el 23/09/2026 09:12"))
    .toBeVisible();
});

test("dates each passkey's last use against the time the list was read again after a removal", async () => {
  const services = createServices();
  let current = new Date("2026-09-23T12:00:00.000Z");
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys)
    .mockResolvedValueOnce({ kind: "ok", value: [notebook, phone] })
    .mockResolvedValueOnce({ kind: "ok", value: [notebook] });
  vi.mocked(services.removeUserPasskey).mockResolvedValue({ kind: "ok" });
  const screen = await render(
    <main>
      <UserDetailScreen
        userId="user-1"
        signedInUserId="admin-1"
        access={ADMINISTRATOR_ACCESS}
        now={() => current}
        services={services}
        onSessionEnded={() => {}}
      />
    </main>,
  );
  await expect
    .element(screen.getByText("Registrada el 02/08/2026 · último uso hoy 09:12"))
    .toBeVisible();

  current = new Date("2026-09-24T12:00:00.000Z");
  const dialog = await openRemoveModal(screen, "Teléfono de Lucía");
  await userEvent.click(dialog.getByRole("button", { name: "Dar de baja" }));

  await expect
    .element(screen.getByText("Registrada el 02/08/2026 · último uso el 23/09/2026 09:12"))
    .toBeVisible();
  expect(services.fetchUserPasskeys).toHaveBeenCalledTimes(2);
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

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

type FetchUserOutcome = Awaited<ReturnType<UserDetailScreenServices["fetchUser"]>>;
type FetchUserPasskeysOutcome = Awaited<ReturnType<UserDetailScreenServices["fetchUserPasskeys"]>>;

test("while the user loads, shows a loading placeholder, keeps Editar disabled and reads the passkeys without waiting for the user", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(screen.getByRole("status").first()).toHaveTextContent("Cargando…");
  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeDisabled();
  await expect.poll(() => vi.mocked(services.fetchUserPasskeys).mock.calls.length).toBe(1);
  expect(services.fetchUserPasskeys).toHaveBeenCalledWith("user-1");
});

test("shows the passkeys placeholder while only the passkeys are loading, with Datos already shown", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  vi.mocked(services.fetchUserPasskeys).mockReturnValue(new Promise(() => {}));

  const screen = await renderScreen(services);

  await expect.element(screen.getByText("lucia.perez@purosur.online")).toBeVisible();
  await expect.element(screen.getByRole("status")).toHaveTextContent("Cargando…");
  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeEnabled();
});

test("a failed user read keeps Editar disabled, and Reintentar starts again from the loading placeholder", async () => {
  const services = createServices();
  const retry = deferred<FetchUserOutcome>();
  vi.mocked(services.fetchUser)
    .mockResolvedValueOnce({ kind: "failed" })
    .mockReturnValueOnce(retry.promise);
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir este usuario")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByText("No pudimos abrir este usuario")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("status").first()).toHaveTextContent("Cargando…");
  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeDisabled();
  retry.resolve({ kind: "ok", value: lucia });
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeEnabled();
});

test("a failed roles read fails the Datos section too, and Reintentar reads the roles again", async () => {
  const services = createServices({
    fetchRoles: vi.fn().mockResolvedValueOnce({ kind: "failed" }),
  });
  vi.mocked(services.fetchUser).mockResolvedValue({ kind: "ok", value: lucia });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("No pudimos abrir este usuario")).toBeVisible();

  vi.mocked(services.fetchRoles).mockResolvedValueOnce({ kind: "ok", value: [shiftRole] });
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  expect(services.fetchUser).toHaveBeenCalledTimes(1);
});

test("a change refreshes the user, the roles and the passkeys from the server, keeping what is shown and Editar enabled meanwhile", async () => {
  const services = createServices();
  const refreshedUser = deferred<FetchUserOutcome>();
  const refreshedPasskeys = deferred<FetchUserPasskeysOutcome>();
  vi.mocked(services.fetchUser)
    .mockResolvedValueOnce({ kind: "ok", value: lucia })
    .mockReturnValueOnce(refreshedUser.promise);
  vi.mocked(services.fetchUserPasskeys)
    .mockResolvedValueOnce({ kind: "ok", value: [notebook] })
    .mockReturnValueOnce(refreshedPasskeys.promise);
  vi.mocked(services.editUser).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  const dialog = await openEditModal(screen);

  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "nueva@purosur.online");
  await userEvent.click(dialog.getByRole("button", { name: "Guardar los cambios" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.poll(() => vi.mocked(services.fetchUser).mock.calls.length).toBe(2);
  await expect.poll(() => vi.mocked(services.fetchRoles).mock.calls.length).toBe(2);
  await expect.poll(() => vi.mocked(services.fetchUserPasskeys).mock.calls.length).toBe(2);
  await expect.element(screen.getByText("lucia.perez@purosur.online")).toBeVisible();
  await expect.element(screen.getByText("Notebook del local")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Editar" })).toBeEnabled();
  refreshedUser.resolve({
    kind: "ok",
    value: { ...lucia, email: "nueva@purosur.online", version: 2 },
  });
  refreshedPasskeys.resolve({ kind: "ok", value: [notebook, phone] });
  await expect.element(screen.getByText("nueva@purosur.online")).toBeVisible();
  await expect.element(screen.getByText("Teléfono de Lucía")).toBeVisible();
});

test("reactivating reads the user, the roles and the passkeys again from the server", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser)
    .mockResolvedValueOnce({ kind: "ok", value: sofia })
    .mockResolvedValueOnce({ kind: "ok", value: { ...sofia, active: true } });
  vi.mocked(services.reactivateUser).mockResolvedValue({ kind: "ok" });
  const screen = await renderScreen(services);
  await expect.element(screen.getByRole("heading", { name: "Sofía Díaz", level: 1 })).toBeVisible();
  const dialog = await openReactivateModal(screen);

  await userEvent.click(dialog.getByRole("button", { name: "Reactivar" }));

  await expect.poll(() => vi.mocked(services.fetchUser).mock.calls.length).toBe(2);
  await expect.poll(() => vi.mocked(services.fetchRoles).mock.calls.length).toBe(2);
  await expect.poll(() => vi.mocked(services.fetchUserPasskeys).mock.calls.length).toBe(2);
});

function RefreshProbe({ onReady }: { onReady: (refresh: () => Promise<void>) => void }) {
  const refreshAccess = useRefreshAccess();
  useEffect(() => onReady(refreshAccess));
  return null;
}

test("a refresh of the user in the background does not overwrite what is typed in the edit modal", async () => {
  const services = createServices();
  vi.mocked(services.fetchUser)
    .mockResolvedValueOnce({ kind: "ok", value: lucia })
    .mockResolvedValueOnce({
      kind: "ok",
      value: { ...lucia, email: "otra@purosur.online", version: 4 },
    });
  let refreshAccess: () => Promise<void> = () => Promise.resolve();
  const screen = await render(
    <main>
      <RefreshProbe
        onReady={(refresh) => {
          refreshAccess = refresh;
        }}
      />
      <UserDetailScreen
        userId="user-1"
        signedInUserId="admin-1"
        access={ADMINISTRATOR_ACCESS}
        now={NOW}
        services={services}
        onSessionEnded={() => {}}
      />
    </main>,
  );
  await expect.element(screen.getByRole("heading", { name: "Lucía", level: 1 })).toBeVisible();
  const dialog = await openEditModal(screen);
  await userEvent.fill(dialog.getByRole("textbox", { name: /^Correo/ }), "escrito@purosur.online");

  await refreshAccess();

  await expect.poll(() => vi.mocked(services.fetchUser).mock.calls.length).toBe(2);
  await expect.element(screen.getByText("otra@purosur.online")).toBeVisible();
  await expect
    .element(dialog.getByRole("textbox", { name: /^Correo/ }))
    .toHaveValue("escrito@purosur.online");
});
