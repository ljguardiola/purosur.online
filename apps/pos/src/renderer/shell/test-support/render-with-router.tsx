import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import type { ComponentRenderOptions } from "vitest-browser-react";
import { render as renderInPage } from "vitest-browser-react";

const ContentContext = createContext<ReactNode>(null);

function Content() {
  return useContext(ContentContext);
}

function createAnyPathRouter() {
  const rootRoute = createRootRoute({ component: Content });
  return createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/" }),
      createRoute({ getParentRoute: () => rootRoute, path: "$" }),
    ]),
  });
}

export async function render(ui: ReactNode, options: ComponentRenderOptions = {}) {
  const router = createAnyPathRouter();
  await router.load();
  return renderInPage(ui, {
    ...options,
    wrapper: ({ children }) => (
      <ContentContext value={children}>
        <RouterProvider router={router} />
      </ContentContext>
    ),
  });
}
