import type {
  CoreStatusMessage,
  EnrollmentOutcome,
  PinCodeRedemptionOutcome,
  SignInOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AnyRoute } from "@tanstack/react-router";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { PinCodeRedemptionScreen } from "../access/pin-code-redemption-screen";
import { SignInScreen } from "../access/sign-in-screen";
import type { SignedInPerson } from "../access/signed-in-person";
import { EnrollmentScreen } from "../register/enrollment-screen";
import { BrandPanelScreen } from "./brand-panel-screen";
import { CoreDownNotice } from "./core-down-notice";
import { SignedInScreen } from "./signed-in-screen";

export type CoreStatus = CoreStatusMessage["status"];

export type Enrollment = "unknown" | "enrolled" | "not_enrolled";

export interface RouterContext {
  coreStatus: CoreStatus;
  enrollment: Enrollment;
  person: SignedInPerson | undefined;
  enroll: (typedCode: string) => Promise<EnrollmentOutcome>;
  signInUsers: () => Promise<SignInUser[]>;
  signIn: (userId: string, pin: string) => Promise<SignInOutcome>;
  redeemPinCode: (typedCode: string, newPin: string) => Promise<PinCodeRedemptionOutcome>;
}

type ScreenPath = "/" | "/sign-in" | "/enroll" | "/starting" | "/core-down";

// Until the core says whether this installation is enrolled, the register stays on the brand panel
// instead of guessing between the enrollment screen and the rest of the register.
export function routeFor({
  coreStatus,
  enrollment,
  person,
}: Pick<RouterContext, "coreStatus" | "enrollment" | "person">): ScreenPath {
  if (coreStatus === "down") {
    return "/core-down";
  }
  if (coreStatus === "starting" || enrollment === "unknown") {
    return "/starting";
  }
  if (enrollment !== "enrolled") {
    return "/enroll";
  }
  return person === undefined ? "/sign-in" : "/";
}

function requireRoute(expected: ScreenPath, context: RouterContext): void {
  const route = routeFor(context);
  if (route !== expected) {
    throw redirect({ to: route });
  }
}

function requireSignedInPerson(context: RouterContext): SignedInPerson {
  if (context.person === undefined || routeFor(context) !== "/") {
    throw redirect({ to: routeFor(context) });
  }
  return context.person;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
});

const signedInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: ({ context }) => ({ person: requireSignedInPerson(context) }),
  component: function SignedInRoute() {
    const { person } = signedInRoute.useRouteContext();
    return <SignedInScreen person={person} />;
  },
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in",
  beforeLoad: ({ context }) => requireRoute("/sign-in", context),
  component: function SignInRoute() {
    const { signInUsers, signIn } = signInRoute.useRouteContext();
    return <SignInScreen loadUsers={signInUsers} signIn={signIn} />;
  },
});

const pinCodeRedemptionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pin-code-redemption",
  beforeLoad: ({ context }) => requireRoute("/sign-in", context),
  component: function PinCodeRedemptionRoute() {
    const { redeemPinCode } = pinCodeRedemptionRoute.useRouteContext();
    return <PinCodeRedemptionScreen redeem={redeemPinCode} />;
  },
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
  signedInRoute,
  signInRoute,
  pinCodeRedemptionRoute,
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

export function createAppRouter(
  services: Pick<RouterContext, "enroll" | "signInUsers" | "signIn" | "redeemPinCode">,
) {
  return createRegisterRouter(
    routeTree,
    { coreStatus: "starting", enrollment: "unknown", person: undefined, ...services },
    "/starting",
  );
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
