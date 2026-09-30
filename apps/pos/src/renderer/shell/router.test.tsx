import { createRootRouteWithContext, createRoute, RouterProvider } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Component } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { CoreStatus, Enrollment, RouterContext } from "./router";
import { createRegisterRouter, routeTree } from "./router";

type RoutePath = "/" | "/enroll" | "/starting" | "/core-down";
type RenderedScreen = Awaited<ReturnType<typeof render>>;

const CORE_DOWN_TITLE = "Esperá un momento";
const SHELL_READY_TEXT = "Puro Sur está listo";
const BRAND_LOGO_ALT = "Puro Sur";
const ENROLLMENT_TITLE = "Dar de alta esta caja";
const OUTER_BOUNDARY_TEXT = "caught outside the router";
const ROUTER_DEFAULT_ERROR_TEXT = "Something went wrong!";

const screenFor: Record<
  RoutePath,
  (screen: RenderedScreen) => ReturnType<RenderedScreen["getByText"]>
> = {
  "/": (screen) => screen.getByText(SHELL_READY_TEXT),
  "/enroll": (screen) => screen.getByRole("heading", { name: ENROLLMENT_TITLE }),
  "/starting": (screen) => screen.getByRole("img", { name: BRAND_LOGO_ALT }),
  "/core-down": (screen) => screen.getByText(CORE_DOWN_TITLE),
};

function contextWith(coreStatus: CoreStatus, enrollment: Enrollment = "enrolled"): RouterContext {
  return {
    coreStatus,
    enrollment,
    enroll: async () => ({ kind: "enrolled" }),
    registerName: async () => null,
  };
}

function routerAt(path: RoutePath, coreStatus: CoreStatus, enrollment?: Enrollment) {
  return createRegisterRouter(routeTree, contextWith(coreStatus, enrollment), path);
}

const screenFailure = new Error("screen failed to render");

class OuterErrorBoundary extends Component<
  { children: ReactNode; onCatch: (error: unknown) => void },
  { error: unknown }
> {
  override state = { error: undefined };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override componentDidCatch(error: unknown) {
    this.props.onCatch(error);
  }

  override render() {
    return this.state.error === undefined ? this.props.children : <p>{OUTER_BOUNDARY_TEXT}</p>;
  }
}

function FailingScreen(): ReactNode {
  throw screenFailure;
}

describe("the register's router", () => {
  it.each<{
    path: RoutePath;
    coreStatus: CoreStatus;
    enrollment: Enrollment;
    redirectedTo: RoutePath;
  }>([
    { path: "/", coreStatus: "down", enrollment: "enrolled", redirectedTo: "/core-down" },
    { path: "/starting", coreStatus: "up", enrollment: "enrolled", redirectedTo: "/" },
    {
      path: "/core-down",
      coreStatus: "starting",
      enrollment: "enrolled",
      redirectedTo: "/starting",
    },
    { path: "/", coreStatus: "up", enrollment: "not_enrolled", redirectedTo: "/enroll" },
    { path: "/enroll", coreStatus: "up", enrollment: "enrolled", redirectedTo: "/" },
    { path: "/", coreStatus: "up", enrollment: "unknown", redirectedTo: "/starting" },
    { path: "/enroll", coreStatus: "down", enrollment: "not_enrolled", redirectedTo: "/core-down" },
  ])(
    "redirects away from $path when the core is $coreStatus and the installation $enrollment",
    async ({ path, coreStatus, enrollment, redirectedTo }) => {
      const router = routerAt(path, coreStatus, enrollment);

      const screen = await render(<RouterProvider router={router} />);

      await expect.element(screenFor[redirectedTo](screen)).toBeVisible();
      await expect.element(screenFor[path](screen)).not.toBeInTheDocument();
    },
  );

  it("renders the enrollment screen while the installation isn't enrolled", async () => {
    const router = routerAt("/enroll", "up", "not_enrolled");

    const screen = await render(<RouterProvider router={router} />);

    await expect.element(screen.getByRole("heading", { name: ENROLLMENT_TITLE })).toBeVisible();
  });

  it("renders the ready route once the core is up", async () => {
    const router = routerAt("/", "up");

    const screen = await render(<RouterProvider router={router} />);

    await expect.element(screen.getByText(SHELL_READY_TEXT)).toBeVisible();
  });

  it("lets an error thrown while rendering a screen propagate past the router", async () => {
    const rootRoute = createRootRouteWithContext<RouterContext>()();
    const failingRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: FailingScreen,
    });
    const router = createRegisterRouter(
      rootRoute.addChildren([failingRoute]),
      contextWith("up"),
      "/",
    );

    const onCatch = vi.fn();

    const screen = await render(
      <OuterErrorBoundary onCatch={onCatch}>
        <RouterProvider router={router} />
      </OuterErrorBoundary>,
    );

    await expect.element(screen.getByText(OUTER_BOUNDARY_TEXT)).toBeVisible();
    await expect.element(screen.getByText(ROUTER_DEFAULT_ERROR_TEXT)).not.toBeInTheDocument();
    expect(onCatch).toHaveBeenCalledWith(screenFailure);
  });
});
