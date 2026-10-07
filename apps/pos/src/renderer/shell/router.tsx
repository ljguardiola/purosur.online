import type {
  AddProductOutcome,
  Authorization,
  CancelLockedSaleOutcome,
  CancelSaleOutcome,
  CashBalance,
  CashChargeAnswer,
  CashCountPreview,
  ChangeLineQuantityOutcome,
  ChargeSaleByTransferOutcome,
  ChargeSaleInCashOutcome,
  CloseCashSessionOutcome,
  CloseLockedCashSessionOutcome,
  CoreStatusMessage,
  CurrentSaleAnswer,
  EnrollmentOutcome,
  FirstPinCodeRequestOutcome,
  IdentifyLockedCloserOutcome,
  ListedCashMovement,
  OpenCashSessionOutcome,
  PinCodeRedemptionOutcome,
  PinPolicy,
  RecordableCashMovementKinds,
  RecordCashMovementOutcome,
  RemoveSaleLineOutcome,
  ScanProductOutcome,
  SearchProductsOutcome,
  SessionOpenSale,
  SignInLookupOutcome,
  SignInOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import type { QueryClient } from "@tanstack/react-query";
import type { AnyRoute } from "@tanstack/react-router";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { pinPolicyQueryOptions } from "../access/access-queries";
import { FirstSignInScreen } from "../access/first-sign-in-screen";
import { PinCodeRedemptionScreen } from "../access/pin-code-redemption-screen";
import { SignInScreen } from "../access/sign-in-screen";
import type { CashMovementInput } from "../platform/core-client";
import { CashCountScreen } from "../register/cash-count-screen";
import { CashScreen } from "../register/cash-screen";
import type { CashSessionState } from "../register/cash-session-state";
import { EnrollmentScreen } from "../register/enrollment-screen";
import { LockedCloseScreen } from "../register/locked-close-screen";
import { LockedRegisterScreen } from "../register/locked-register-screen";
import { NoSessionScreen } from "../register/no-session-screen";
import { OutOfServiceScreen } from "../register/out-of-service-screen";
import { registerNameQueryOptions, useRegisterNameQuery } from "../register/register-queries";
import { ChargeScreen } from "../sales/charge-screen";
import { SaleScreen } from "../sales/sale-screen";
import { ACTION_ENTRIES } from "./action-entries";
import { BrandPanelScreen } from "./brand-panel-screen";
import { CoreDownNotice } from "./core-down-notice";
import type { SignedInPerson } from "./signed-in-person";

export type CoreStatus = CoreStatusMessage["status"];

export type Enrollment = "unknown" | "enrolled" | "not_enrolled";

export type RegisterServiceState = "unknown" | "in_service" | "out_of_service";

export interface RouterContext {
  queryClient: QueryClient;
  coreStatus: CoreStatus;
  registerService: RegisterServiceState;
  enrollment: Enrollment;
  person: SignedInPerson | undefined;
  cashSession: CashSessionState;
  enroll: (typedCode: string) => Promise<EnrollmentOutcome>;
  signInUsers: () => Promise<SignInUser[]>;
  authorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  lockedClosers: () => Promise<SignInUser[]>;
  signIn: (userId: string, pin: string) => Promise<SignInOutcome>;
  registerName: () => Promise<string | null>;
  signOut: () => void;
  openCashSession: (openingFloat: number) => Promise<OpenCashSessionOutcome>;
  closeCashSession: (
    person: SignedInPerson,
    sessionId: string,
    countedCash: number,
    leaving: boolean,
  ) => Promise<CloseCashSessionOutcome>;
  closeLockedCashSession: (
    sessionId: string,
    countedCash: number,
    closer: Authorization,
  ) => Promise<CloseLockedCashSessionOutcome>;
  cancelLockedSale: (closer: Authorization) => Promise<CancelLockedSaleOutcome>;
  identifyLockedCloser: (closer: Authorization) => Promise<IdentifyLockedCloserOutcome>;
  cashBalance: () => Promise<CashBalance | null | "unavailable">;
  cashCountPreview: (countedCash: number) => Promise<CashCountPreview | null | "unavailable">;
  sessionOpenSale: () => Promise<SessionOpenSale | null | "unavailable">;
  cashMovements: () => Promise<ListedCashMovement[] | null | "unavailable">;
  cashMovementKinds: () => Promise<RecordableCashMovementKinds | null | "unavailable">;
  recordCashMovement: (input: CashMovementInput) => Promise<RecordCashMovementOutcome>;
  redeemPinCode: (typedCode: string, newPin: string) => Promise<PinCodeRedemptionOutcome>;
  pinPolicy: () => Promise<PinPolicy>;
  checkEnrollmentCode: (typedCode: string) => Promise<"code"[]>;
  checkPinCodeRedemption: (
    typedCode: string,
    newPin: string,
  ) => Promise<("reset_code" | "new_pin")[]>;
  signInLookup: (email: string) => Promise<SignInLookupOutcome>;
  requestFirstPinCode: (userId: string) => Promise<FirstPinCodeRequestOutcome>;
  firstSignIn: (userId: string, pin: string) => Promise<SignInOutcome>;
  currentSale: () => Promise<CurrentSaleAnswer>;
  scanProduct: (code: string) => Promise<ScanProductOutcome>;
  cashCharge: (saleId: string, tendered: number) => Promise<CashChargeAnswer>;
  chargeSaleInCash: (saleId: string, tendered: number) => Promise<ChargeSaleInCashOutcome>;
  chargeSaleByTransfer: (saleId: string, amount: number) => Promise<ChargeSaleByTransferOutcome>;
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
  | "/core-down"
  | "/out-of-service";

// Until the core says whether the register is in service and then whether this installation is
// enrolled, the register stays on the brand panel instead of guessing which screen comes next. The
// same goes for whether a cash session is open, which decides between signing in and resuming it.
export function routeFor({
  coreStatus,
  registerService,
  enrollment,
  person,
  cashSession,
}: Pick<
  RouterContext,
  "coreStatus" | "registerService" | "enrollment" | "person" | "cashSession"
>): ScreenPath {
  if (coreStatus === "down") {
    return "/core-down";
  }
  if (coreStatus === "starting" || registerService === "unknown") {
    return "/starting";
  }
  if (registerService === "out_of_service") {
    return "/out-of-service";
  }
  if (enrollment === "unknown") {
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

function useRegisterName() {
  const { registerName } = rootRoute.useRouteContext();
  return useRegisterNameQuery(registerName);
}

const sessionEyebrowRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "session-eyebrow",
  loader: async ({ context }) => {
    await context.queryClient
      .ensureQueryData(registerNameQueryOptions(context.registerName))
      .catch(() => null);
  },
  component: Outlet,
});

const signedInRoute = createRoute({
  getParentRoute: () => sessionEyebrowRoute,
  path: "/",
  beforeLoad: ({ context }) => ({ person: requireSignedInPerson(context) }),
  component: function SignedInRoute() {
    const { person, signOut, openCashSession } = signedInRoute.useRouteContext();
    const registerName = useRegisterName();
    return (
      <NoSessionScreen
        person={person}
        registerName={registerName}
        entries={ACTION_ENTRIES}
        signOut={signOut}
        openCashSession={openCashSession}
      />
    );
  },
});

const openSessionRoute = createRoute({
  getParentRoute: () => sessionEyebrowRoute,
  path: "/session",
  beforeLoad: ({ context }) => {
    const { id, openedAt, person } = requireOpenSession(context);
    return { id, openedAt, person };
  },
  component: function OpenSessionRoute() {
    const {
      id,
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
    const registerName = useRegisterName();
    return (
      <SaleScreen
        sessionId={id}
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

const chargeRoute = createRoute({
  getParentRoute: () => sessionEyebrowRoute,
  path: "/charge",
  beforeLoad: ({ context }) => {
    const { id, person } = requireOpenSession(context);
    return { id, person };
  },
  component: function ChargeRoute() {
    const {
      id,
      person,
      signOut,
      currentSale,
      cashCharge,
      chargeSaleInCash,
      chargeSaleByTransfer,
      refreshCashSession,
    } = chargeRoute.useRouteContext();
    const registerName = useRegisterName();
    return (
      <ChargeScreen
        sessionId={id}
        person={person}
        registerName={registerName}
        lock={signOut}
        currentSale={currentSale}
        cashCharge={cashCharge}
        chargeSaleInCash={chargeSaleInCash}
        chargeSaleByTransfer={chargeSaleByTransfer}
        onSessionInvalid={() => void refreshCashSession()}
      />
    );
  },
});

const cashRoute = createRoute({
  getParentRoute: () => sessionEyebrowRoute,
  path: "/cash",
  beforeLoad: ({ context }) => {
    const { id, openedAt, person } = requireOpenSession(context);
    return { id, openedAt, person };
  },
  component: function CashRoute() {
    const {
      id,
      openedAt,
      person,
      signOut,
      cashBalance,
      cashMovements,
      cashMovementKinds,
      authorizers,
      recordCashMovement,
    } = cashRoute.useRouteContext();
    const registerName = useRegisterName();
    return (
      <CashScreen
        sessionId={id}
        person={person}
        registerName={registerName}
        openedAt={openedAt}
        lock={signOut}
        loadCashBalance={cashBalance}
        loadCashMovements={cashMovements}
        loadCashMovementKinds={cashMovementKinds}
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
    const { id, openedAt, person } = requireOpenSession(context);
    return { id, openedAt, person };
  },
  component: function CashCountRoute() {
    const { id, openedAt, person, signOut, cashBalance, cashCountPreview, closeCashSession } =
      cashCountRoute.useRouteContext();
    const registerName = useRegisterName();
    const { leaving } = cashCountRoute.useSearch();
    return (
      <CashCountScreen
        sessionId={id}
        person={person}
        registerName={registerName}
        openedAt={openedAt}
        lock={signOut}
        loadCashBalance={cashBalance}
        loadCashCountPreview={cashCountPreview}
        closeCashSession={(countedCash) => closeCashSession(person, id, countedCash, leaving)}
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
    const registerName = useRegisterName();
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

const lockedCloseRoute = createRoute({
  getParentRoute: () => sessionEyebrowRoute,
  path: "/locked-close",
  beforeLoad: ({ context }) => {
    const { id, openedAt, openedBy } = requireLockedRegister(context);
    return { id, openedAt, openedBy };
  },
  component: function LockedCloseRoute() {
    const {
      id,
      openedAt,
      openedBy,
      cashBalance,
      cashCountPreview,
      sessionOpenSale,
      lockedClosers,
      identifyLockedCloser,
      closeLockedCashSession,
      cancelLockedSale,
    } = lockedCloseRoute.useRouteContext();
    const registerName = useRegisterName();
    return (
      <LockedCloseScreen
        sessionId={id}
        opener={openedBy}
        registerName={registerName}
        openedAt={openedAt}
        loadCashBalance={cashBalance}
        loadCashCountPreview={cashCountPreview}
        loadOpenSale={sessionOpenSale}
        loadClosers={lockedClosers}
        identifyLockedCloser={identifyLockedCloser}
        closeLockedCashSession={(countedCash, closer) =>
          closeLockedCashSession(id, countedCash, closer)
        }
        cancelLockedSale={cancelLockedSale}
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
    const registerName = useRegisterName();
    return <SignInScreen loadUsers={signInUsers} signIn={signIn} registerName={registerName} />;
  },
});

async function loadPinPolicy({
  queryClient,
  pinPolicy,
}: Pick<RouterContext, "queryClient" | "pinPolicy">): Promise<void> {
  await queryClient.ensureQueryData(pinPolicyQueryOptions(pinPolicy));
}

const pinCodeRedemptionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pin-code-redemption",
  beforeLoad: ({ context }) => requireRoute(["/sign-in", "/locked"], context),
  loader: ({ context }) => loadPinPolicy(context),
  component: function PinCodeRedemptionRoute() {
    const { redeemPinCode, pinPolicy, checkPinCodeRedemption } =
      pinCodeRedemptionRoute.useRouteContext();
    return (
      <PinCodeRedemptionScreen
        loadPinPolicy={pinPolicy}
        checkRedemption={checkPinCodeRedemption}
        redeem={redeemPinCode}
      />
    );
  },
});

const firstSignInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/first-sign-in",
  beforeLoad: ({ context }) => requireRoute("/sign-in", context),
  loader: ({ context }) => loadPinPolicy(context),
  component: function FirstSignInRoute() {
    const {
      signInLookup,
      firstSignIn,
      requestFirstPinCode,
      redeemPinCode,
      pinPolicy,
      checkPinCodeRedemption,
    } = firstSignInRoute.useRouteContext();
    return (
      <FirstSignInScreen
        lookup={signInLookup}
        signIn={firstSignIn}
        requestCode={requestFirstPinCode}
        loadPinPolicy={pinPolicy}
        checkRedemption={checkPinCodeRedemption}
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
    const { enroll, checkEnrollmentCode } = enrollRoute.useRouteContext();
    return <EnrollmentScreen checkCode={checkEnrollmentCode} enroll={enroll} />;
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

const outOfServiceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/out-of-service",
  beforeLoad: ({ context }) => requireRoute("/out-of-service", context),
  component: OutOfServiceScreen,
});

export const routeTree = rootRoute.addChildren([
  sessionEyebrowRoute.addChildren([
    signedInRoute,
    signInRoute,
    openSessionRoute,
    chargeRoute,
    cashRoute,
    cashCountRoute,
    lockedRoute,
    lockedCloseRoute,
  ]),
  pinCodeRedemptionRoute,
  firstSignInRoute,
  enrollRoute,
  startingRoute,
  coreDownRoute,
  outOfServiceRoute,
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
  queryClient: QueryClient,
  services: Pick<
    RouterContext,
    | "enroll"
    | "registerName"
    | "signInUsers"
    | "signIn"
    | "signOut"
    | "openCashSession"
    | "closeCashSession"
    | "closeLockedCashSession"
    | "cancelLockedSale"
    | "identifyLockedCloser"
    | "cashBalance"
    | "cashCountPreview"
    | "sessionOpenSale"
    | "cashMovements"
    | "cashMovementKinds"
    | "recordCashMovement"
    | "authorizers"
    | "lockedClosers"
    | "redeemPinCode"
    | "pinPolicy"
    | "checkEnrollmentCode"
    | "checkPinCodeRedemption"
    | "signInLookup"
    | "requestFirstPinCode"
    | "firstSignIn"
    | "currentSale"
    | "scanProduct"
    | "cashCharge"
    | "chargeSaleInCash"
    | "chargeSaleByTransfer"
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
      queryClient,
      coreStatus: "starting",
      registerService: "unknown",
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
