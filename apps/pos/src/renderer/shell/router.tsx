import type { CoreStatusMessage, EnrollmentOutcome } from "@purosur/contracts";
import type { AnyRoute } from "@tanstack/react-router";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { EnrollmentScreen } from "../register/enrollment-screen";
import { BrandPanelScreen } from "./brand-panel-screen";
import { CoreDownNotice } from "./core-down-notice";
import { ReadyScreen } from "./ready-screen";

export type CoreStatus = CoreStatusMessage["status"];

export type Enrollment = "unknown" | "enrolled" | "not_enrolled";

export interface RouterContext {
  coreStatus: CoreStatus;
  enrollment: Enrollment;
  enroll: (typedCode: string) => Promise<EnrollmentOutcome>;
}

type ScreenPath = "/" | "/enroll" | "/starting" | "/core-down";

// Until the core says whether this installation is enrolled, the register stays on the brand panel
// instead of guessing between the enrollment screen and the rest of the register.
export function routeFor({ coreStatus, enrollment }: Omit<RouterContext, "enroll">): ScreenPath {
  if (coreStatus === "down") {
    return "/core-down";
  }
  if (coreStatus === "starting" || enrollment === "unknown") {
    return "/starting";
  }
  return enrollment === "enrolled" ? "/" : "/enroll";
}

function requireRoute(expected: ScreenPath, context: RouterContext): void {
  const route = routeFor(context);
  if (route !== expected) {
    throw redirect({ to: route });
  }
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
});

const readyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: ({ context }) => requireRoute("/", context),
  component: ReadyScreen,
});

const enrollRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/enroll",
  beforeLoad: ({ context }) => requireRoute("/enroll", context),
  component: function EnrollRoute() {
    const { enroll } = enrollRoute.useRouteContext();
    return <EnrollmentScreen enroll={enroll} />;
  },
});

const startingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/starting",
  beforeLoad: ({ context }) => requireRoute("/starting", context),
  component: BrandPanelScreen,
});

const coreDownRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/core-down",
  beforeLoad: ({ context }) => requireRoute("/core-down", context),
  component: CoreDownNotice,
});

export const routeTree = rootRoute.addChildren([
  readyRoute,
  enrollRoute,
  startingRoute,
  coreDownRoute,
]);

export function createRegisterRouter<TRouteTree extends AnyRoute>(
  tree: TRouteTree,
  context: RouterContext,
  initialPath: string,
) {
  return createRouter({
    routeTree: tree,
    context,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    disableGlobalCatchBoundary: true,
  });
}

export function createAppRouter(enroll: RouterContext["enroll"]) {
  return createRegisterRouter(
    routeTree,
    { coreStatus: "starting", enrollment: "unknown", enroll },
    "/starting",
  );
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
