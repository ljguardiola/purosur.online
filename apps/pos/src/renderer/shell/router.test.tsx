import { createRootRouteWithContext, createRoute, RouterProvider } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Component } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { SignedInPerson } from "../access/signed-in-person";
import type { CoreStatus, Enrollment, RouterContext } from "./router";
import { createRegisterRouter, routeFor, routeTree } from "./router";

type RoutePath = "/" | "/sign-in" | "/enroll" | "/starting" | "/core-down";
type RenderedScreen = Awaited<ReturnType<typeof render>>;

const CORE_DOWN_TITLE = "Esperá un momento";
const SIGNED_IN_TITLE = "¿Qué querés hacer?";
const SIGN_IN_TITLE = "¿Quién abre la caja?";
const PERSON: SignedInPerson = { first_name: "Ada", permission_keys: [] };
const BRAND_LOGO_ALT = "Puro Sur";
const ENROLLMENT_TITLE = "Dar de alta esta caja";
const OUTER_BOUNDARY_TEXT = "caught outside the router";
const ROUTER_DEFAULT_ERROR_TEXT = "Something went wrong!";

const screenFor: Record<
  RoutePath,
  (screen: RenderedScreen) => ReturnType<RenderedScreen["getByText"]>
> = {
  "/": (screen) => screen.getByRole("heading", { name: SIGNED_IN_TITLE }),
  "/sign-in": (screen) => screen.getByRole("heading", { name: SIGN_IN_TITLE }),
  "/enroll": (screen) => screen.getByRole("heading", { name: ENROLLMENT_TITLE }),
  "/starting": (screen) => screen.getByRole("img", { name: BRAND_LOGO_ALT }),
  "/core-down": (screen) => screen.getByText(CORE_DOWN_TITLE),
};

function contextWith(
  coreStatus: CoreStatus,
  enrollment: Enrollment = "enrolled",
  person: SignedInPerson | null = PERSON,
): RouterContext {
  return {
    coreStatus,
    enrollment,
    person: person ?? undefined,
    enroll: async () => ({ kind: "enrolled" }),
    signInUsers: async () => [{ id: "u1", first_name: "Ada" }],
    signIn: async () => ({ kind: "signed_in", person: PERSON }),
  };
}

function routerAt(
  path: RoutePath,
  coreStatus: CoreStatus,
  enrollment?: Enrollment,
  person?: SignedInPerson | null,
) {
  return createRegisterRouter(routeTree, contextWith(coreStatus, enrollment, person), path);
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

describe("routeFor", () => {
  it.each<{
    coreStatus: CoreStatus;
    enrollment: Enrollment;
    person: SignedInPerson | undefined;
    route: RoutePath;
  }>([
    { coreStatus: "up", enrollment: "enrolled", person: undefined, route: "/sign-in" },
    { coreStatus: "up", enrollment: "enrolled", person: PERSON, route: "/" },
    { coreStatus: "up", enrollment: "not_enrolled", person: PERSON, route: "/enroll" },
    { coreStatus: "up", enrollment: "unknown", person: PERSON, route: "/starting" },
    { coreStatus: "starting", enrollment: "enrolled", person: PERSON, route: "/starting" },
    { coreStatus: "down", enrollment: "enrolled", person: PERSON, route: "/core-down" },
  ])(
    "goes to $route when the core is $coreStatus, the installation $enrollment and a person may be signed in",
    ({ coreStatus, enrollment, person, route }) => {
      expect(routeFor({ coreStatus, enrollment, person })).toBe(route);
    },
  );
});

describe("the register's router", () => {
  it.each<{
    path: RoutePath;
    coreStatus: CoreStatus;
    enrollment: Enrollment;
    person?: null;
    redirectedTo: RoutePath;
  }>([
    { path: "/", coreStatus: "down", enrollment: "enrolled", redirectedTo: "/core-down" },
    {
      path: "/",
      coreStatus: "up",
      enrollment: "enrolled",
      person: null,
      redirectedTo: "/sign-in",
    },
    { path: "/sign-in", coreStatus: "up", enrollment: "enrolled", redirectedTo: "/" },
    {
      path: "/sign-in",
      coreStatus: "up",
      enrollment: "not_enrolled",
      person: null,
      redirectedTo: "/enroll",
    },
    {
      path: "/enroll",
      coreStatus: "up",
      enrollment: "enrolled",
      person: null,
      redirectedTo: "/sign-in",
    },
    {
      path: "/sign-in",
      coreStatus: "down",
      enrollment: "enrolled",
      person: null,
      redirectedTo: "/core-down",
    },
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
    async ({ path, coreStatus, enrollment, person, redirectedTo }) => {
      const router = routerAt(path, coreStatus, enrollment, person === null ? null : PERSON);

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

  it("renders the sign-in screen while enrolled and nobody is signed in", async () => {
    const router = routerAt("/sign-in", "up", "enrolled", null);

    const screen = await render(<RouterProvider router={router} />);

    await expect.element(screen.getByRole("heading", { name: SIGN_IN_TITLE })).toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "Ada" })).toBeVisible();
  });

  it("renders the signed-in screen for the person from the router context", async () => {
    const router = routerAt("/", "up");

    const screen = await render(<RouterProvider router={router} />);

    await expect.element(screen.getByRole("heading", { name: SIGNED_IN_TITLE })).toBeVisible();
    await expect
      .element(screen.getByRole("complementary", { name: "Persona en la caja" }))
      .toHaveTextContent("Ada");
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
