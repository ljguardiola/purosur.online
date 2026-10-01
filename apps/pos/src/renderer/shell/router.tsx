import type {
  AddProductOutcome,
  Authorization,
  CancelSaleOutcome,
  CashBalance,
  ChangeLineQuantityOutcome,
  CloseCashSessionOutcome,
  CoreStatusMessage,
  CurrentSaleAnswer,
  EnrollmentOutcome,
  FirstPinCodeRequestOutcome,
  ListedCashMovement,
  OpenCashSessionOutcome,
  PinCodeRedemptionOutcome,
  RecordCashMovementOutcome,
  RemoveSaleLineOutcome,
  ScanProductOutcome,
  SearchProductsOutcome,
  SignInLookupOutcome,
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
import { FirstSignInScreen } from "../access/first-sign-in-screen";
import { PinCodeRedemptionScreen } from "../access/pin-code-redemption-screen";
import { SignInScreen } from "../access/sign-in-screen";
import type { SignedInPerson } from "../access/signed-in-person";
import type { CashMovementInput } from "../platform/core-client";
import { CashCountScreen } from "../register/cash-count-screen";
import { CashScreen } from "../register/cash-screen";
import { EnrollmentScreen } from "../register/enrollment-screen";
import { SaleScreen } from "../sales/sale-screen";
import { ACTION_ENTRIES } from "./action-entries";
import { BrandPanelScreen } from "./brand-panel-screen";
import type { CashSessionState } from "./cash-session-state";
import { CoreDownNotice } from "./core-down-notice";
import { LockedRegisterScreen } from "./locked-register-screen";
import { NoSessionScreen } from "./no-session-screen";

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
  closeCashSession: (
    person: SignedInPerson,
    sessionId: string,
    countedCash: number,
    authorization: Authorization | undefined,
    leaving: boolean,
  ) => Promise<CloseCashSessionOutcome>;
  cashBalance: () => Promise<CashBalance | null | "unavailable">;
  cashMovements: () => Promise<ListedCashMovement[] | null | "unavailable">;
  recordCashMovement: (input: CashMovementInput) => Promise<RecordCashMovementOutcome>;
  redeemPinCode: (typedCode: string, newPin: string) => Promise<PinCodeRedemptionOutcome>;
  signInLookup: (email: string) => Promise<SignInLookupOutcome>;
  requestFirstPinCode: (userId: string) => Promise<FirstPinCodeRequestOutcome>;
  firstSignIn: (userId: string, pin: string) => Promise<SignInOutcome>;
  currentSale: () => Promise<CurrentSaleAnswer>;
  scanProduct: (code: string) => Promise<ScanProductOutcome>;
  searchProducts: (query: string) => Promise<SearchProductsOutcome>;
  addProduct: (productId: string) => Promise<AddProductOutcome>;
  changeLineQuantity: (
    lineId: string,
    quantity: number,
    expectedQuantity: number,
  ) => Promise<ChangeLineQuantityOutcome>;
  removeSaleLine: (lineId: string) => Promise<RemoveSaleLineOutcome>;
  cancelSale: () => Promise<CancelSaleOutcome>;
  refreshCashSession: () => Promise<void>;
}

type ScreenPath =
  | "/"
  | "/sign-in"
  | "/session"
  | "/locked"
  | "/enroll"
  | "/starting"
  | "/core-down";

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
    return person === undefined ? "/locked" : "/session";
  }
  return person === undefined ? "/sign-in" : "/";
}

const SESSION_SCREENS: readonly string[] = ["/session", "/cash", "/cash-count"];

export function isSessionScreen(path: string): boolean {
  return SESSION_SCREENS.includes(path);
}

function requireRoute(expected: ScreenPath | readonly ScreenPath[], context: RouterContext): void {
  const route = routeFor(context);
  if (![expected].flat().includes(route)) {
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
  if (
    context.cashSession.status !== "open" ||
    context.person === undefined ||
    routeFor(context) !== "/session"
  ) {
    throw redirect({ to: routeFor(context) });
  }
  return { ...context.cashSession, person: context.person };
}

function requireLockedRegister(context: RouterContext) {
  if (context.cashSession.status !== "open" || routeFor(context) !== "/locked") {
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
    const { openedAt, person } = requireOpenSession(context);
    return { openedAt, person };
  },
  component: function OpenSessionRoute() {
    const {
      openedAt,
      person,
      signOut,
      currentSale,
      scanProduct,
      searchProducts,
      addProduct,
      changeLineQuantity,
      removeSaleLine,
      cancelSale,
      refreshCashSession,
    } = openSessionRoute.useRouteContext();
    const registerName = sessionEyebrowRoute.useLoaderData();
    return (
      <SaleScreen
        person={person}
        registerName={registerName}
        openedAt={openedAt}
        lock={signOut}
        currentSale={currentSale}
        scanProduct={scanProduct}
        searchProducts={searchProducts}
        addProduct={addProduct}
        changeLineQuantity={changeLineQuantity}
        removeSaleLine={removeSaleLine}
        cancelSale={cancelSale}
        onSessionInvalid={() => void refreshCashSession()}
      />
    );
  },
});

const cashRoute = createRoute({
  getParentRoute: () => sessionEyebrowRoute,
  path: "/cash",
  beforeLoad: ({ context }) => {
    const { openedAt, person } = requireOpenSession(context);
    return { openedAt, person };
  },
  component: function CashRoute() {
    const {
      openedAt,
      person,
      signOut,
      cashBalance,
      cashMovements,
      authorizers,
      recordCashMovement,
    } = cashRoute.useRouteContext();
    const registerName = sessionEyebrowRoute.useLoaderData();
    return (
      <CashScreen
        person={person}
        registerName={registerName}
        openedAt={openedAt}
        lock={signOut}
        loadCashBalance={cashBalance}
        loadCashMovements={cashMovements}
        loadAuthorizers={authorizers}
        recordCashMovement={recordCashMovement}
      />
    );
  },
});

const cashCountRoute = createRoute({
  getParentRoute: () => sessionEyebrowRoute,
  path: "/cash-count",
  validateSearch: (search: { leaving?: unknown }) => ({ leaving: search.leaving === true }),
  beforeLoad: ({ context }) => {
    const { id, openedAt, openedBy, person } = requireOpenSession(context);
    return { id, openedAt, openedBy, person };
  },
  component: function CashCountRoute() {
    const { id, openedAt, openedBy, person, signOut, cashBalance, authorizers, closeCashSession } =
      cashCountRoute.useRouteContext();
    const registerName = sessionEyebrowRoute.useLoaderData();
    const { leaving } = cashCountRoute.useSearch();
    return (
      <CashCountScreen
        person={person}
        openedBy={openedBy}
        registerName={registerName}
        openedAt={openedAt}
        lock={signOut}
        loadCashBalance={cashBalance}
        loadAuthorizers={authorizers}
        closeCashSession={(countedCash, authorization) =>
          closeCashSession(person, id, countedCash, authorization, leaving)
        }
      />
    );
  },
});

const lockedRoute = createRoute({
  getParentRoute: () => sessionEyebrowRoute,
  path: "/locked",
  beforeLoad: ({ context }) => {
    const { openedAt, openedBy } = requireLockedRegister(context);
    return { openedAt, openedBy };
  },
  component: function LockedRoute() {
    const { openedAt, openedBy, signIn } = lockedRoute.useRouteContext();
    const registerName = sessionEyebrowRoute.useLoaderData();
    return (
      <LockedRegisterScreen
        opener={openedBy}
        registerName={registerName}
        openedAt={openedAt}
        signIn={signIn}
      />
    );
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
  beforeLoad: ({ context }) => requireRoute(["/sign-in", "/locked"], context),
  component: function PinCodeRedemptionRoute() {
    const { redeemPinCode } = pinCodeRedemptionRoute.useRouteContext();
    return <PinCodeRedemptionScreen redeem={redeemPinCode} />;
  },
});

const firstSignInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/first-sign-in",
  beforeLoad: ({ context }) => requireRoute("/sign-in", context),
  component: function FirstSignInRoute() {
    const { signInLookup, firstSignIn, requestFirstPinCode, redeemPinCode } =
      firstSignInRoute.useRouteContext();
    return (
      <FirstSignInScreen
        lookup={signInLookup}
        signIn={firstSignIn}
        requestCode={requestFirstPinCode}
        redeem={redeemPinCode}
      />
    );
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
  sessionEyebrowRoute.addChildren([
    signedInRoute,
    signInRoute,
    openSessionRoute,
    cashRoute,
    cashCountRoute,
    lockedRoute,
  ]),
  pinCodeRedemptionRoute,
  firstSignInRoute,
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
    | "closeCashSession"
    | "cashBalance"
    | "cashMovements"
    | "recordCashMovement"
    | "authorizers"
    | "redeemPinCode"
    | "signInLookup"
    | "requestFirstPinCode"
    | "firstSignIn"
    | "currentSale"
    | "scanProduct"
    | "searchProducts"
    | "addProduct"
    | "changeLineQuantity"
    | "removeSaleLine"
    | "cancelSale"
    | "refreshCashSession"
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
