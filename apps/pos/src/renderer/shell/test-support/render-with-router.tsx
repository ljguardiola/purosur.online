import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import type { ComponentRenderOptions } from "vitest-browser-react";
import { render as renderInPage } from "vitest-browser-react";
import { createQueryClient } from "../../platform/query-client";

const ContentContext = createContext<ReactNode>(null);

function Content() {
  return useContext(ContentContext);
}

function createAnyPathRouter() {
  const rootRoute = createRootRoute({ component: Content });
  return createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/" }),
      createRoute({ getParentRoute: () => rootRoute, path: "$" }),
    ]),
  });
}

export async function render(ui: ReactNode, options: ComponentRenderOptions = {}) {
  const router = createAnyPathRouter();
  const queryClient = createQueryClient();
  await router.load();
  const screen = await renderInPage(ui, {
    ...options,
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <ContentContext value={children}>
          <RouterProvider router={router} />
        </ContentContext>
      </QueryClientProvider>
    ),
  });
  return Object.assign(screen, { router, queryClient });
}
