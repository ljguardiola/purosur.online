import type {
  CoreStatusMessage,
  EnrollmentOutcome,
  OpenCashSessionOutcome,
  PinCodeRedemptionOutcome,
  SignInOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
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
import { ACTION_ENTRIES } from "./action-entries";
import { BrandPanelScreen } from "./brand-panel-screen";
import type { CashSessionState } from "./cash-session-state";
import { CoreDownNotice } from "./core-down-notice";
import { NoSessionScreen } from "./no-session-screen";
import { OpenSessionScreen } from "./open-session-screen";

export type CoreStatus = CoreStatusMessage["status"];

export type Enrollment = "unknown" | "enrolled" | "not_enrolled";

export interface RouterContext {
  coreStatus: CoreStatus;
  enrollment: Enrollment;
  person: SignedInPerson | undefined;
  cashSession: CashSessionState;
  enroll: (typedCode: string) => Promise<EnrollmentOutcome>;
  signInUsers: () => Promise<SignInUser[]>;
  authorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  signIn: (userId: string, pin: string) => Promise<SignInOutcome>;
  registerName: () => Promise<string | null>;
  signOut: () => void;
  openCashSession: (
    person: SignedInPerson,
    openingFloat: number,
  ) => Promise<OpenCashSessionOutcome>;
  redeemPinCode: (typedCode: string, newPin: string) => Promise<PinCodeRedemptionOutcome>;
}

type ScreenPath = "/" | "/sign-in" | "/session" | "/enroll" | "/starting" | "/core-down";

// Until the core says whether this installation is enrolled, the register stays on the brand panel
// instead of guessing between the enrollment screen and the rest of the register. The same goes
// for whether a cash session is open, which decides between signing in and resuming it.
export function routeFor({
  coreStatus,
  enrollment,
  person,
  cashSession,
}: Pick<RouterContext, "coreStatus" | "enrollment" | "person" | "cashSession">): ScreenPath {
  if (coreStatus === "down") {
    return "/core-down";
  }
  if (coreStatus === "starting" || enrollment === "unknown") {
    return "/starting";
  }
  if (enrollment !== "enrolled") {
    return "/enroll";
  }
  if (cashSession.status === "unknown") {
    return "/starting";
  }
  if (cashSession.status === "unavailable") {
    return "/core-down";
  }
  if (cashSession.status === "open") {
    return "/session";
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

function requireOpenSession(context: RouterContext) {
  if (context.cashSession.status !== "open" || routeFor(context) !== "/session") {
    throw redirect({ to: routeFor(context) });
  }
  return context.cashSession;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
});

const sessionEyebrowRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "session-eyebrow",
  loader: ({ context }) => context.registerName().catch(() => null),
  component: Outlet,
});

const signedInRoute = createRoute({
  getParentRoute: () => sessionEyebrowRoute,
  path: "/",
  beforeLoad: ({ context }) => ({ person: requireSignedInPerson(context) }),
  component: function SignedInRoute() {
    const { person, signOut, openCashSession } = signedInRoute.useRouteContext();
    const registerName = sessionEyebrowRoute.useLoaderData();
    return (
      <NoSessionScreen
        person={person}
        registerName={registerName}
        entries={ACTION_ENTRIES}
        signOut={signOut}
        openCashSession={(openingFloat) => openCashSession(person, openingFloat)}
      />
    );
  },
});

const openSessionRoute = createRoute({
  getParentRoute: () => sessionEyebrowRoute,
  path: "/session",
  beforeLoad: ({ context }) => {
    const { openedAt, openedBy } = requireOpenSession(context);
    return { openedAt, openedBy };
  },
  component: function OpenSessionRoute() {
    const { openedAt, openedBy } = openSessionRoute.useRouteContext();
    const registerName = sessionEyebrowRoute.useLoaderData();
    return <OpenSessionScreen person={openedBy} registerName={registerName} openedAt={openedAt} />;
  },
});

const signInRoute = createRoute({
  getParentRoute: () => sessionEyebrowRoute,
  path: "/sign-in",
  beforeLoad: ({ context }) => requireRoute("/sign-in", context),
  component: function SignInRoute() {
    const { signInUsers, signIn } = signInRoute.useRouteContext();
    const registerName = sessionEyebrowRoute.useLoaderData();
    return <SignInScreen loadUsers={signInUsers} signIn={signIn} registerName={registerName} />;
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
  sessionEyebrowRoute.addChildren([signedInRoute, signInRoute, openSessionRoute]),
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
  services: Pick<
    RouterContext,
    | "enroll"
    | "registerName"
    | "signInUsers"
    | "signIn"
    | "signOut"
    | "openCashSession"
    | "authorizers"
    | "redeemPinCode"
  >,
) {
  return createRegisterRouter(
    routeTree,
    {
      coreStatus: "starting",
      enrollment: "unknown",
      person: undefined,
      cashSession: { status: "unknown" },
      ...services,
    },
    "/starting",
  );
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
