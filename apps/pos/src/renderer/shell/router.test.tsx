import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import type { CoreStatus } from "./router";
import { routeTree } from "./router";

type RoutePath = "/" | "/starting" | "/core-down";
type RenderedScreen = Awaited<ReturnType<typeof render>>;

const CORE_DOWN_TITLE = "Esperá un momento";
const SHELL_READY_TEXT = "Puro Sur está listo";
const BRAND_LOGO_ALT = "Puro Sur";

const screenFor: Record<
  RoutePath,
  (screen: RenderedScreen) => ReturnType<RenderedScreen["getByText"]>
> = {
  "/": (screen) => screen.getByText(SHELL_READY_TEXT),
  "/starting": (screen) => screen.getByRole("img", { name: BRAND_LOGO_ALT }),
  "/core-down": (screen) => screen.getByText(CORE_DOWN_TITLE),
};

function routerAt(path: RoutePath, coreStatus: CoreStatus) {
  return createRouter({
    routeTree,
    context: { coreStatus },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
}

describe("the register's router", () => {
  it.each<{ path: RoutePath; coreStatus: CoreStatus; redirectedTo: RoutePath }>([
    { path: "/", coreStatus: "down", redirectedTo: "/core-down" },
    { path: "/starting", coreStatus: "up", redirectedTo: "/" },
    { path: "/core-down", coreStatus: "starting", redirectedTo: "/starting" },
  ])(
    "redirects away from $path when the core is $coreStatus",
    async ({ path, coreStatus, redirectedTo }) => {
      const router = routerAt(path, coreStatus);

      const screen = await render(<RouterProvider router={router} />);

      await expect.element(screenFor[redirectedTo](screen)).toBeVisible();
      await expect.element(screenFor[path](screen)).not.toBeInTheDocument();
    },
  );

  it("renders the ready route once the core is up", async () => {
    const router = routerAt("/", "up");

    const screen = await render(<RouterProvider router={router} />);

    await expect.element(screen.getByText(SHELL_READY_TEXT)).toBeVisible();
  });
});
