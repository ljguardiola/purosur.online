import { vi } from "vitest";
import { StubRoleCreationModal } from "../../platform/test-support/creation-parts";
import type { BackofficeAccess } from "../../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS } from "../../shell/test-support/backoffice-access";
import { render } from "../../shell/test-support/render-with-router";
import { type UsersListFilters, usersListFilters } from "../routes";
import type { UserDetailScreenServices } from "../user-detail-services";
import { type UsersListEndEverySessionSectionProps, UsersListScreen } from "../users-list-screen";
import type { UsersListScreenServices } from "../users-list-services";
import { CredentialSectionsStub, createServices } from "./user-detail-screen";

export function EndEverySessionSectionStub({
  onSessionEnded,
}: UsersListEndEverySessionSectionProps) {
  return (
    <section aria-label="Cerrar sesiones">
      <button type="button" onClick={onSessionEnded}>
        Terminar la sesión
      </button>
    </section>
  );
}

export function createUsersListServices(
  overrides: Partial<UsersListScreenServices> = {},
): UsersListScreenServices {
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
          mayEdit: false,
        },
      ],
    });
  }
  return services;
}

export function usersListScreenElement(
  services: UsersListScreenServices,
  onSessionEnded: () => void = () => {},
  access: BackofficeAccess = ADMINISTRATOR_ACCESS,
  {
    filters = usersListFilters.parse({}),
    onFiltersChange = () => {},
    openUser,
    tab,
    detailServices = createServices(),
  }: {
    filters?: UsersListFilters;
    onFiltersChange?: (filters: UsersListFilters) => void;
    openUser?: string;
    tab?: string;
    detailServices?: UserDetailScreenServices;
  } = {},
) {
  return (
    <main>
      <UsersListScreen
        services={services}
        onSessionEnded={onSessionEnded}
        access={access}
        roleCreationModal={StubRoleCreationModal}
        filters={filters}
        onFiltersChange={onFiltersChange}
        endEverySessionSection={EndEverySessionSectionStub}
        signedInUserId="admin-1"
        credentialSections={CredentialSectionsStub}
        detailServices={detailServices}
        openUser={openUser}
        tab={tab}
      />
    </main>
  );
}

export function renderUsersList(...args: Parameters<typeof usersListScreenElement>) {
  return render(usersListScreenElement(...args));
}
