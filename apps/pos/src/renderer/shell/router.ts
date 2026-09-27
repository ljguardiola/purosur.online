import type { CoreStatusMessage } from "@purosur/contracts";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { BrandPanelScreen } from "./brand-panel-screen";
import { CoreDownNotice } from "./core-down-notice";
import { ReadyScreen } from "./ready-screen";

export type CoreStatus = CoreStatusMessage["status"];

export interface RouterContext {
  coreStatus: CoreStatus;
}

export const ROUTE_FOR_STATUS: Record<CoreStatus, "/" | "/starting" | "/core-down"> = {
  up: "/",
  starting: "/starting",
  down: "/core-down",
};

// A route only renders once its own status has been confirmed; any other status redirects to the
// route that owns it, so a status change never leaves two screens matching at once.
function requireCoreStatus(expected: CoreStatus, context: RouterContext): void {
  if (context.coreStatus !== expected) {
    throw redirect({ to: ROUTE_FOR_STATUS[context.coreStatus] });
  }
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
});

const readyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: ({ context }) => requireCoreStatus("up", context),
  component: ReadyScreen,
});

const startingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/starting",
  beforeLoad: ({ context }) => requireCoreStatus("starting", context),
  component: BrandPanelScreen,
});

const coreDownRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/core-down",
  beforeLoad: ({ context }) => requireCoreStatus("down", context),
  component: CoreDownNotice,
});

export const routeTree = rootRoute.addChildren([readyRoute, startingRoute, coreDownRoute]);

export function createAppRouter() {
  return createRouter({
    routeTree,
    context: { coreStatus: "starting" },
    history: createMemoryHistory({ initialEntries: [ROUTE_FOR_STATUS.starting] }),
  });
}

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
