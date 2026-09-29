import { expect, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../../shell/test-support/render-with-router";
import type { BackofficeAccess } from "../backoffice-access";
import type { Passkey } from "../passkey-api";
import type { RoleSummary } from "../roles-api";
import { UserDetailScreen } from "../user-detail-screen";
import type { UserDetailScreenServices } from "../user-detail-services";
import type { BranchUser } from "../users-api";

export const ADMINISTRATOR_ACCESS: BackofficeAccess = { isAdministrator: true, permissions: [] };

export const shiftRole: RoleSummary = {
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

export function createServices(
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

export const lucia: BranchUser = {
  id: "user-1",
  firstName: "Lucía",
  email: "lucia.perez@purosur.online",
  version: 1,
  role: shiftRole,
  passkeyCount: 1,
  isLastActiveAdministrator: false,
};

export const NOW = () => new Date("2026-09-23T12:00:00.000Z");

export const notebook: Passkey = {
  id: "pk-1",
  name: "Notebook del local",
  createdAt: "2026-08-02T12:00:00.000Z",
  // 09:12 in America/Argentina/Buenos_Aires (UTC-3), same calendar day as NOW below.
  lastUsedAt: "2026-09-23T12:12:00.000Z",
};
export const phone: Passkey = {
  id: "pk-2",
  name: "Teléfono de Lucía",
  createdAt: "2026-08-10T12:00:00.000Z",
  lastUsedAt: null,
};

export function renderScreen(
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

export const DEACTIVATE_USERS_ACCESS: BackofficeAccess = {
  isAdministrator: false,
  permissions: ["deactivate_users"],
};
export const NO_DEACTIVATE_ACCESS: BackofficeAccess = { isAdministrator: false, permissions: [] };

export const adminTarget: BranchUser = {
  id: "user-4",
  firstName: "Ana Fernández",
  email: "ana@purosur.online",
  version: 1,
  role: { id: "00000000-0000-4000-8000-000000000001", isAdministrator: true, name: null },
  passkeyCount: 1,
  isLastActiveAdministrator: false,
};

export const REACTIVATE_USERS_ACCESS: BackofficeAccess = {
  isAdministrator: false,
  permissions: ["reactivate_users"],
};

export const sofia: BranchUser = {
  id: "user-5",
  firstName: "Sofía Díaz",
  email: "sofia.diaz@purosur.online",
  version: 1,
  active: false,
  role: shiftRole,
  passkeyCount: 1,
  isLastActiveAdministrator: false,
};

export async function openEditModal(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Editar" }));
  return screen.getByRole("dialog", { name: "Lucía" });
}

export async function openStaleModal(services: UserDetailScreenServices) {
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

export async function openRemoveModal(screen: Screen, name: string) {
  await userEvent.click(screen.getByRole("button", { name: `Dar de baja la passkey «${name}»` }));
  return screen.getByRole("dialog", { name: "¿Dar de baja la passkey de Lucía?" });
}

export async function openDeactivateModal(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Desactivar a Lucía" }));
  return screen.getByRole("dialog", { name: "¿Desactivar a Lucía?" });
}

export async function openReactivateModal(screen: Screen) {
  await userEvent.click(screen.getByRole("button", { name: "Reactivar a Sofía Díaz" }));
  return screen.getByRole("dialog", { name: "¿Reactivar a Sofía Díaz?" });
}

export function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

export type FetchUserOutcome = Awaited<ReturnType<UserDetailScreenServices["fetchUser"]>>;
export type FetchUserPasskeysOutcome = Awaited<
  ReturnType<UserDetailScreenServices["fetchUserPasskeys"]>
>;

export type Screen = Awaited<ReturnType<typeof renderScreen>>;
