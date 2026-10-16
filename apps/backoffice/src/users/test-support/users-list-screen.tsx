import { vi } from "vitest";
import type { BackofficeAccess } from "../../shell/backoffice-access";
import { ADMINISTRATOR_ACCESS } from "../../shell/test-support/backoffice-access";
import { render } from "../../shell/test-support/render-with-router";
import { usersListFilters } from "../routes";
import { type UsersListEndEverySessionSectionProps, UsersListScreen } from "../users-list-screen";
import type { UsersListScreenServices } from "../users-list-services";

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

export function createUsersListServices(): UsersListScreenServices {
  return {
    fetchUsers: vi.fn().mockReturnValue(new Promise(() => {})),
    fetchRoles: vi.fn().mockReturnValue(new Promise(() => {})),
    createUser: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
  };
}

export function renderUsersList(
  services: UsersListScreenServices,
  {
    access = ADMINISTRATOR_ACCESS,
    onSessionEnded = () => {},
  }: { access?: BackofficeAccess; onSessionEnded?: () => void } = {},
) {
  return render(
    <main>
      <UsersListScreen
        services={services}
        onSessionEnded={onSessionEnded}
        access={access}
        filters={usersListFilters.parse({})}
        onFiltersChange={() => {}}
        endEverySessionSection={EndEverySessionSectionStub}
      />
    </main>,
  );
}
