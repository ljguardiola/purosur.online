import { QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { Passkey } from "../../platform/passkey-list";
import { createQueryClient } from "../../platform/query-client";
import {
  UserCredentialSections,
  type UserCredentialSectionsProps,
} from "../user-credential-sections";
import type { UserCredentialSectionsServices } from "../user-credential-sections-services";

export const NOW = () => new Date("2026-09-23T12:00:00.000Z");

export const lucia = {
  id: "user-1",
  firstName: "Lucía",
  mayRemovePasskey: true,
};

export const notebook: Passkey = {
  id: "pk-1",
  name: "Notebook del local",
  createdAt: "2026-08-02T12:00:00.000Z",
  // 09:12 in America/Argentina/Buenos_Aires (UTC-3), same calendar day as NOW.
  lastUsedAt: "2026-09-23T12:12:00.000Z",
};
export const phone: Passkey = {
  id: "pk-2",
  name: "Teléfono de Lucía",
  createdAt: "2026-08-10T12:00:00.000Z",
  lastUsedAt: null,
};

export function createServices(
  overrides: Partial<UserCredentialSectionsServices> = {},
): UserCredentialSectionsServices {
  return {
    fetchUserPasskeys: vi.fn().mockResolvedValue({ kind: "ok", value: [] }),
    removeUserPasskey: vi.fn(),
    emitUserPinCode: vi.fn(),
    fetchSessionAuthorizationOptions: vi.fn(),
    authorizeSession: vi.fn(),
    startAuthentication: vi.fn(),
    ...overrides,
  };
}

export function defaultProps(
  overrides: Partial<UserCredentialSectionsProps> = {},
): UserCredentialSectionsProps {
  return {
    userId: "user-1",
    user: lucia,
    dataStatus: "loaded",
    showsPasskeys: true,
    showsPin: false,
    onSessionEnded: () => {},
    onUserOutdated: () => {},
    now: NOW,
    ...overrides,
  };
}

function createSectionsRouter(
  services: UserCredentialSectionsServices,
  props: UserCredentialSectionsProps,
) {
  const rootRoute = createRootRouteWithContext<{
    services: { userCredentialSections: UserCredentialSectionsServices };
  }>()();
  const signedInRoute = createRoute({ getParentRoute: () => rootRoute, id: "signed-in" });
  const settingsAreaRoute = createRoute({
    getParentRoute: () => signedInRoute,
    id: "settings-area",
  });
  const userDetailRoute = createRoute({
    getParentRoute: () => settingsAreaRoute,
    path: "users/$userId",
    component: () => (
      <main>
        <UserCredentialSections {...props} />
      </main>
    ),
  });
  const accountRoute = createRoute({ getParentRoute: () => settingsAreaRoute, path: "account" });
  return createRouter({
    routeTree: rootRoute.addChildren([
      signedInRoute.addChildren([settingsAreaRoute.addChildren([userDetailRoute, accountRoute])]),
    ]),
    context: { services: { userCredentialSections: services } },
  });
}

export async function renderSections(
  services: UserCredentialSectionsServices,
  props: Partial<UserCredentialSectionsProps> = {},
) {
  window.history.pushState(null, "", "/users/user-1");
  const router = createSectionsRouter(services, defaultProps(props));
  await router.load();
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

export type SectionsScreen = Awaited<ReturnType<typeof renderSections>>;

export async function openRemoveModal(screen: SectionsScreen, name: string) {
  await userEvent.click(screen.getByRole("button", { name: `Dar de baja la passkey «${name}»` }));
  return screen.getByRole("dialog", { name: "¿Dar de baja la passkey de Lucía?" });
}
