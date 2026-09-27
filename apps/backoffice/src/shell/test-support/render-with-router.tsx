import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { createContext, type ReactNode, useContext } from "react";
import { type ComponentRenderOptions, render as renderInPage } from "vitest-browser-react";

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
