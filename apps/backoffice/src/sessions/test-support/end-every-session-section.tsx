import { QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "vitest-browser-react";
import { createQueryClient } from "../../platform/query-client";
import {
  EndEverySessionSection,
  type EndEverySessionSectionProps,
} from "../end-every-session-section";
import type { EndEverySessionSectionServices } from "../end-every-session-section-services";

function createSectionRouter(
  services: EndEverySessionSectionServices,
  props: EndEverySessionSectionProps,
) {
  const rootRoute = createRootRouteWithContext<{
    services: { endEverySessionSection: EndEverySessionSectionServices };
  }>()();
  const signedInRoute = createRoute({ getParentRoute: () => rootRoute, id: "signed-in" });
  const settingsAreaRoute = createRoute({
    getParentRoute: () => signedInRoute,
    id: "settings-area",
  });
  const usersRoute = createRoute({
    getParentRoute: () => settingsAreaRoute,
    path: "users",
    component: () => (
      <main>
        <EndEverySessionSection {...props} />
      </main>
    ),
  });
  const accountRoute = createRoute({ getParentRoute: () => settingsAreaRoute, path: "account" });
  return createRouter({
    routeTree: rootRoute.addChildren([
      signedInRoute.addChildren([settingsAreaRoute.addChildren([usersRoute, accountRoute])]),
    ]),
    context: { services: { endEverySessionSection: services } },
  });
}

export async function renderSection(
  services: EndEverySessionSectionServices,
  props: Partial<EndEverySessionSectionProps> = {},
) {
  window.history.pushState(null, "", "/users");
  const router = createSectionRouter(services, { onSessionEnded: () => {}, ...props });
  await router.load();
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
