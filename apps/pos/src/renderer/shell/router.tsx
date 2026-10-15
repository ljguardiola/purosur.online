import type {
  AbandonMercadoPagoChargeOutcome,
  AddProductOutcome,
  AddWeighedProductOutcome,
  AdjustSaleLineOutcome,
  ApplySaleDiscountOutcome,
  Authorization,
  CancelLockedSaleOutcome,
  CancelPaidSaleOutcome,
  CancelSaleOutcome,
  CashBalance,
  CashChargeAnswer,
  CashCountPreview,
  ChangeLineQuantityOutcome,
  ChangeLineWeightOutcome,
  ChargeSaleByTransferOutcome,
  ChargeSaleInCashOutcome,
  ChargeSaleOnStandaloneTerminalOutcome,
  CloseCashSessionOutcome,
  CloseLockedCashSessionOutcome,
  ConvertPaidOrderIntoRefundOutcome,
  CoreStatusMessage,
  CorrectRegisterClockOutcome,
  CurrentSaleAnswer,
  EnrollmentOutcome,
  FindCountableProductOutcome,
  FirstPinCodeRequestOutcome,
  FollowMercadoPagoChargeOutcome,
  IdentifyLockedCloserOutcome,
  ListedCashMovement,
  ManualAdjustmentRequest,
  OpenCashSessionOutcome,
  PaymentMethodAvailability,
  PinCodeRedemptionOutcome,
  PinPolicy,
  PreviewSaleDiscountOutcome,
  PreviewSaleLineAdjustmentOutcome,
  PrintOriginalReceiptOutcome,
  ReadClockGuardOutcome,
  ReadInitialCountOutcome,
  ReadReceiptPrinterOutcome,
  ReadSerialDevicesOutcome,
  ReceiptPrintStatusOutcome,
  RecordableCashMovementKinds,
  RecordCashMovementOutcome,
  RecordInitialCountLineOutcome,
  RegisterSerialDevicesOutcome,
  RegisterStatus,
  RemoveSaleLineOutcome,
  ReprintSaleReceiptOutcome,
  SaleDiscountRequest,
  SaleHistoryDetailOutcome,
  SalesHistoryOutcome,
  ScanProductOutcome,
  SearchCountableProductsOutcome,
  SearchProductsOutcome,
  SessionOpenSale,
  SetReceiptPrinterOutcome,
  SignInLookupOutcome,
  SignInOutcome,
  SignInUser,
  StartMercadoPagoChargeOutcome,
  VoidSaleOutcome,
  WeighCountedProductOutcome,
  WeighProductOutcome,
  WithdrawInitialCountLineOutcome,
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
  useRouter,
} from "@tanstack/react-router";
import { pinPolicyQueryOptions } from "../credentials/credentials-queries";
import { FirstSignInCodeStep } from "../credentials/first-sign-in-code-step";
import { FirstSignInNoPin } from "../credentials/first-sign-in-no-pin";
import { PinCodeRedemptionScreen } from "../credentials/pin-code-redemption-screen";
import { ClockGuardOffer } from "../fiscal/clock-guard-offer";
import { HelpScreen } from "../help/help-screen";
import { help } from "../help/register-help";
import type {
  CashMovementInput,
  MercadoPagoMethod,
  SalesHistoryQuery,
  SerialDevicesToRegister,
} from "../platform/core-client";
import { CashCountScreen } from "../register/cash-count-screen";
import { CashScreen } from "../register/cash-screen";
import type { CashSessionState } from "../register/cash-session-state";
import { EnrollmentScreen } from "../register/enrollment-screen";
import { LockedCloseScreen } from "../register/locked-close-screen";
import { LockedRegisterScreen } from "../register/locked-register-screen";
import { NoSessionScreen } from "../register/no-session-screen";
import { OlderVersionScreen } from "../register/older-version-screen";
import { OutOfServiceScreen } from "../register/out-of-service-screen";
import { ReceiptPrinterScreen } from "../register/receipt-printer-screen";
import type { StartupPendingAnswer } from "../register/register-queries";
import {
  registerNameQueryOptions,
  registerStatusQueryOptions,
  startupPendingQueryOptions,
  useRegisterNameQuery,
  useRegisterStatusQuery,
} from "../register/register-queries";
import { mayConfigureSerialDevices } from "../register/serial-devices-offer";
import { SerialDevicesScreen } from "../register/serial-devices-screen";
import { StartupPendingScreen } from "../register/startup-pending-screen";
import { ChargeScreen } from "../sales/charge-screen";
import { SaleScreen } from "../sales/sale-screen";
import { SalesHistoryScreen } from "../sales/sales-history-screen";
import { FirstSignInScreen } from "../sessions/first-sign-in-screen";
import { SignInScreen } from "../sessions/sign-in-screen";
import { InitialCountOffer } from "../stock/initial-count-offer";
import { InitialCountScreen } from "../stock/initial-count-screen";
import { initialCountQueryOptions } from "../stock/stock-queries";
import { BrandPanelScreen } from "./brand-panel-screen";
import { CoreDownNotice } from "./core-down-notice";
import { RegisterUpdatingNotice } from "./register-updating-notice";
import type { SignedInPerson } from "./signed-in-person";
import type { StartupPendingGate } from "./startup-pending-gate";
import { StatusBarLayout } from "./status-bar-layout";

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
  cancelLockedSale: (saleId: string, closer: Authorization) => Promise<CancelLockedSaleOutcome>;
  identifyLockedCloser: (closer: Authorization) => Promise<IdentifyLockedCloserOutcome>;
  cashBalance: () => Promise<CashBalance | null | "unavailable">;
  cashCountPreview: (countedCash: number) => Promise<CashCountPreview | null | "unavailable">;
  sessionOpenSale: () => Promise<SessionOpenSale | null | "unavailable">;
  cashMovements: () => Promise<ListedCashMovement[] | null | "unavailable">;
  cashMovementKinds: () => Promise<RecordableCashMovementKinds | null | "unavailable">;
  registerStatus: () => Promise<RegisterStatus | "unavailable">;
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
  chargeSaleOnStandaloneTerminal: (
    saleId: string,
    amount: number,
  ) => Promise<ChargeSaleOnStandaloneTerminalOutcome>;
  paymentMethodAvailability: () => Promise<PaymentMethodAvailability | null>;
  startMercadoPagoCharge: (
    saleId: string,
    method: MercadoPagoMethod,
    amount: number,
  ) => Promise<StartMercadoPagoChargeOutcome>;
  followMercadoPagoCharge: (
    paymentTransactionId: string,
  ) => Promise<FollowMercadoPagoChargeOutcome>;
  abandonMercadoPagoCharge: (
    paymentTransactionId: string,
  ) => Promise<AbandonMercadoPagoChargeOutcome>;
  searchProducts: (query: string) => Promise<SearchProductsOutcome>;
  addProduct: (productId: string) => Promise<AddProductOutcome>;
  addWeighedProduct: (
    productId: string,
    weightThousandths: number,
  ) => Promise<AddWeighedProductOutcome>;
  weighProduct: (productId: string) => Promise<WeighProductOutcome>;
  changeLineQuantity: (
    lineId: string,
    quantity: number,
    expectedQuantity: number,
  ) => Promise<ChangeLineQuantityOutcome>;
  changeLineWeight: (
    lineId: string,
    weightThousandths: number,
    expectedWeightThousandths: number,
  ) => Promise<ChangeLineWeightOutcome>;
  adjustSaleLine: (
    lineId: string,
    adjustment: ManualAdjustmentRequest,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<AdjustSaleLineOutcome>;
  previewSaleLineAdjustment: (
    lineId: string,
    adjustment: ManualAdjustmentRequest,
  ) => Promise<PreviewSaleLineAdjustmentOutcome>;
  applySaleDiscount: (
    discount: SaleDiscountRequest,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ApplySaleDiscountOutcome>;
  previewSaleDiscount: (discount: SaleDiscountRequest) => Promise<PreviewSaleDiscountOutcome>;
  removeSaleLine: (lineId: string) => Promise<RemoveSaleLineOutcome>;
  cancelSale: () => Promise<CancelSaleOutcome>;
  cancelPaidSale: (
    saleId: string,
    authorization: Authorization | undefined,
  ) => Promise<CancelPaidSaleOutcome>;
  voidSale: (
    saleId: string,
    pendingRefundsConfirmed: boolean,
    authorization: Authorization | undefined,
  ) => Promise<VoidSaleOutcome>;
  receiptPrintStatus: (saleId: string) => Promise<ReceiptPrintStatusOutcome>;
  printOriginalReceipt: (saleId: string) => Promise<PrintOriginalReceiptOutcome>;
  convertPaidOrderIntoRefund: (
    paymentTransactionId: string,
  ) => Promise<ConvertPaidOrderIntoRefundOutcome>;
  reprintSaleReceipt: (
    saleId: string,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ReprintSaleReceiptOutcome>;
  salesHistory: (query: SalesHistoryQuery) => Promise<SalesHistoryOutcome>;
  saleHistoryDetail: (saleId: string) => Promise<SaleHistoryDetailOutcome>;
  readReceiptPrinter: () => Promise<ReadReceiptPrinterOutcome>;
  setReceiptPrinter: (address: string) => Promise<SetReceiptPrinterOutcome>;
  readSerialDevices: () => Promise<ReadSerialDevicesOutcome>;
  registerSerialDevices: (
    devices: SerialDevicesToRegister,
  ) => Promise<RegisterSerialDevicesOutcome>;
  takeSerialDevicesOffer: (readStatus: () => Promise<RegisterStatus>) => Promise<boolean>;
  startupPending: () => Promise<StartupPendingAnswer>;
  startupPendingGate: StartupPendingGate;
  readClockGuard: () => Promise<ReadClockGuardOutcome>;
  correctRegisterClock: () => Promise<CorrectRegisterClockOutcome>;
  readInitialCount: () => Promise<ReadInitialCountOutcome>;
  recordInitialCountLine: (
    productId: string,
    counted: number,
    expiresOn: string | null,
  ) => Promise<RecordInitialCountLineOutcome>;
  withdrawInitialCountLine: (movementId: string) => Promise<WithdrawInitialCountLineOutcome>;
  findCountableProduct: (code: string) => Promise<FindCountableProductOutcome>;
  searchCountableProducts: (query: string) => Promise<SearchCountableProductsOutcome>;
  weighCountedProduct: (productId: string) => Promise<WeighCountedProductOutcome>;
  refreshCashSession: () => Promise<void>;
}

type ScreenPath =
  | "/"
  | "/sign-in"
  | "/session"
  | "/history"
  | "/locked"
  | "/enroll"
  | "/starting"
  | "/core-down"
  | "/updating"
  | "/out-of-service"
  | "/older-version";

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
  if (coreStatus === "refused") {
    return "/older-version";
  }
  if (coreStatus === "down") {
    return "/core-down";
  }
  if (coreStatus === "updating") {
    return "/updating";
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

function requireSignedInPersonAnywhere(context: RouterContext) {
  const route = routeFor(context);
  if (context.person === undefined || (route !== "/" && route !== "/session")) {
    throw redirect({ to: route });
  }
  return { person: context.person, sessionOpen: route === "/session" };
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

function RootScreen() {
  return (
    <div className="h-screen w-screen">
      <Outlet />
    </div>
  );
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootScreen,
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

const statusBarRoute = createRoute({
  getParentRoute: () => sessionEyebrowRoute,
  id: "status-bar",
  component: function StatusBarRoute() {
    const { person, cashSession, registerStatus } = statusBarRoute.useRouteContext();
    return (
      <StatusBarLayout person={person} cashSession={cashSession} readStatus={registerStatus} />
    );
  },
});

const signedInRoute = createRoute({
  getParentRoute: () => statusBarRoute,
  path: "/",
  beforeLoad: async ({ context }) => {
    const person = requireSignedInPerson(context);
    const landsOnSerialDevices = await context.takeSerialDevicesOffer(() =>
      context.queryClient.fetchQuery({
        ...registerStatusQueryOptions(context.registerStatus),
        staleTime: 0,
      }),
    );
    if (landsOnSerialDevices) {
      throw redirect({ to: "/serial-devices", search: { offered: true } });
    }
    return { person };
  },
  component: function SignedInRoute() {
    const {
      person,
      signOut,
      openCashSession,
      readInitialCount,
      readClockGuard,
      correctRegisterClock,
      refreshCashSession,
    } = signedInRoute.useRouteContext();
    const registerName = useRegisterName();
    return (
      <NoSessionScreen
        person={person}
        registerName={registerName}
        signOut={signOut}
        offers={
          <>
            <ClockGuardOffer
              registerName={registerName}
              cashSessionOpen={false}
              readClockGuard={readClockGuard}
              correctRegisterClock={correctRegisterClock}
              onSessionInvalid={() => void refreshCashSession()}
            />
            <InitialCountOffer person={person} readInitialCount={readInitialCount} />
          </>
        }
        openCashSession={openCashSession}
      />
    );
  },
});

const helpRoute = createRoute({
  getParentRoute: () => statusBarRoute,
  path: "/help",
  beforeLoad: ({ context }) => {
    const { person, sessionOpen } = requireSignedInPersonAnywhere(context);
    if (!person.abilities.includes("read_register_help")) {
      throw redirect({ to: routeFor(context) });
    }
    return { person, sessionOpen };
  },
  component: function HelpRoute() {
    const { person, sessionOpen, signOut } = helpRoute.useRouteContext();
    const registerName = useRegisterName();
    return (
      <HelpScreen
        person={person}
        registerName={registerName}
        sessionOpen={sessionOpen}
        help={help}
        signOut={signOut}
      />
    );
  },
});

const receiptPrinterRoute = createRoute({
  getParentRoute: () => statusBarRoute,
  path: "/receipt-printer",
  beforeLoad: ({ context }) => {
    const { person, sessionOpen } = requireSignedInPersonAnywhere(context);
    if (!person.abilities.includes("configure_receipt_printer")) {
      throw redirect({ to: routeFor(context) });
    }
    return { person, sessionOpen };
  },
  component: function ReceiptPrinterRoute() {
    const {
      person,
      sessionOpen,
      signOut,
      readReceiptPrinter,
      setReceiptPrinter,
      refreshCashSession,
    } = receiptPrinterRoute.useRouteContext();
    const registerName = useRegisterName();
    return (
      <ReceiptPrinterScreen
        person={person}
        registerName={registerName}
        sessionOpen={sessionOpen}
        signOut={signOut}
        readReceiptPrinter={readReceiptPrinter}
        setReceiptPrinter={setReceiptPrinter}
        onSessionInvalid={() => void refreshCashSession()}
      />
    );
  },
});

const serialDevicesRoute = createRoute({
  getParentRoute: () => statusBarRoute,
  path: "/serial-devices",
  validateSearch: (search: { offered?: unknown }) => ({ offered: search.offered === true }),
  beforeLoad: ({ context }) => {
    const { person, sessionOpen } = requireSignedInPersonAnywhere(context);
    if (!mayConfigureSerialDevices(person)) {
      throw redirect({ to: routeFor(context) });
    }
    return { person, sessionOpen };
  },
  component: function SerialDevicesRoute() {
    const {
      person,
      sessionOpen,
      signOut,
      readSerialDevices,
      registerSerialDevices,
      refreshCashSession,
    } = serialDevicesRoute.useRouteContext();
    const { offered } = serialDevicesRoute.useSearch();
    const registerName = useRegisterName();
    const navigate = serialDevicesRoute.useNavigate();
    return (
      <SerialDevicesScreen
        person={person}
        registerName={registerName}
        sessionOpen={sessionOpen}
        signOut={signOut}
        readSerialDevices={readSerialDevices}
        registerSerialDevices={registerSerialDevices}
        onSessionInvalid={() => void refreshCashSession()}
        {...(offered ? { onSkip: () => void navigate({ to: "/" }) } : {})}
      />
    );
  },
});

const initialCountRoute = createRoute({
  getParentRoute: () => statusBarRoute,
  path: "/initial-count",
  beforeLoad: async ({ context }) => {
    const person = requireSignedInPerson(context);
    if (!person.abilities.includes("record_initial_inventory")) {
      throw redirect({ to: "/" });
    }
    const count = await context.queryClient
      .fetchQuery({ ...initialCountQueryOptions(context.readInitialCount), staleTime: 0 })
      .catch(() => undefined);
    if (count?.kind === "read" && !count.offered) {
      throw redirect({ to: "/" });
    }
    return { person };
  },
  component: function InitialCountRoute() {
    const {
      person,
      signOut,
      readInitialCount,
      recordInitialCountLine,
      withdrawInitialCountLine,
      findCountableProduct,
      searchCountableProducts,
      weighCountedProduct,
      refreshCashSession,
    } = initialCountRoute.useRouteContext();
    return (
      <InitialCountScreen
        person={person}
        signOut={signOut}
        readInitialCount={readInitialCount}
        recordInitialCountLine={recordInitialCountLine}
        withdrawInitialCountLine={withdrawInitialCountLine}
        findCountableProduct={findCountableProduct}
        searchCountableProducts={searchCountableProducts}
        weighCountedProduct={weighCountedProduct}
        onSessionInvalid={() => void refreshCashSession()}
      />
    );
  },
});

const openSessionRoute = createRoute({
  getParentRoute: () => statusBarRoute,
  path: "/session",
  beforeLoad: async ({ context }) => {
    const { id, person } = requireOpenSession(context);
    const landsOnStartupPending = await context.startupPendingGate.lands(() =>
      context.queryClient.fetchQuery({
        ...startupPendingQueryOptions(context.startupPending),
        staleTime: 0,
      }),
    );
    if (landsOnStartupPending) {
      throw redirect({ to: "/startup-pending" });
    }
    return { id, person };
  },
  component: function OpenSessionRoute() {
    const {
      id,
      person,
      signOut,
      currentSale,
      scanProduct,
      searchProducts,
      addProduct,
      addWeighedProduct,
      weighProduct,
      changeLineQuantity,
      changeLineWeight,
      adjustSaleLine,
      previewSaleLineAdjustment,
      applySaleDiscount,
      previewSaleDiscount,
      removeSaleLine,
      cancelSale,
      cancelPaidSale,
      authorizers,
      refreshCashSession,
      registerStatus,
    } = openSessionRoute.useRouteContext();
    const registerName = useRegisterName();
    const status = useRegisterStatusQuery(registerStatus);
    return (
      <SaleScreen
        sessionId={id}
        person={person}
        registerName={registerName}
        lock={signOut}
        currentSale={currentSale}
        scanProduct={scanProduct}
        searchProducts={searchProducts}
        addProduct={addProduct}
        addWeighedProduct={addWeighedProduct}
        weighProduct={weighProduct}
        changeLineQuantity={changeLineQuantity}
        changeLineWeight={changeLineWeight}
        adjustSaleLine={adjustSaleLine}
        previewSaleLineAdjustment={previewSaleLineAdjustment}
        applySaleDiscount={applySaleDiscount}
        previewSaleDiscount={previewSaleDiscount}
        removeSaleLine={removeSaleLine}
        cancelSale={cancelSale}
        cancelPaidSale={cancelPaidSale}
        loadAuthorizers={authorizers}
        onSessionInvalid={() => void refreshCashSession()}
        registerStatus={status}
      />
    );
  },
});

const startupPendingRoute = createRoute({
  getParentRoute: () => statusBarRoute,
  path: "/startup-pending",
  beforeLoad: async ({ context }) => {
    const { id, openedAt, openedBy, person } = requireOpenSession(context);
    const landsOnStartupPending = await context.startupPendingGate.lands(() =>
      context.queryClient.fetchQuery({
        ...startupPendingQueryOptions(context.startupPending),
        staleTime: 0,
      }),
    );
    if (!landsOnStartupPending) {
      throw redirect({ to: "/session" });
    }
    return { id, openedAt, openedBy, person };
  },
  component: function StartupPendingRoute() {
    const {
      id,
      openedAt,
      openedBy,
      person,
      signOut,
      startupPending,
      startupPendingGate,
      cashBalance,
      printOriginalReceipt,
      reprintSaleReceipt,
      convertPaidOrderIntoRefund,
      authorizers,
      readClockGuard,
      correctRegisterClock,
      refreshCashSession,
    } = startupPendingRoute.useRouteContext();
    const registerName = useRegisterName();
    const navigate = startupPendingRoute.useNavigate();
    const router = useRouter();
    return (
      <StartupPendingScreen
        sessionId={id}
        person={person}
        sessionOwner={openedBy}
        openedAt={openedAt}
        registerName={registerName}
        lock={signOut}
        loadStartupPending={startupPending}
        loadCashBalance={cashBalance}
        printOriginalReceipt={printOriginalReceipt}
        reprintSaleReceipt={reprintSaleReceipt}
        convertPaidOrderIntoRefund={convertPaidOrderIntoRefund}
        loadAuthorizers={authorizers}
        clockGuard={
          <ClockGuardOffer
            registerName={registerName}
            cashSessionOpen
            readClockGuard={readClockGuard}
            correctRegisterClock={correctRegisterClock}
            onSessionInvalid={() => void refreshCashSession()}
          />
        }
        onGoSelling={() => {
          startupPendingGate.dismiss();
          void navigate({ to: "/session" });
        }}
        onNothingLeft={() => void router.invalidate()}
        onSessionInvalid={() => void refreshCashSession()}
      />
    );
  },
});

const chargeRoute = createRoute({
  getParentRoute: () => statusBarRoute,
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
      chargeSaleOnStandaloneTerminal,
      paymentMethodAvailability,
      startMercadoPagoCharge,
      followMercadoPagoCharge,
      abandonMercadoPagoCharge,
      receiptPrintStatus,
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
        chargeSaleOnStandaloneTerminal={chargeSaleOnStandaloneTerminal}
        paymentMethodAvailability={paymentMethodAvailability}
        startMercadoPagoCharge={startMercadoPagoCharge}
        followMercadoPagoCharge={followMercadoPagoCharge}
        abandonMercadoPagoCharge={abandonMercadoPagoCharge}
        receiptPrintStatus={receiptPrintStatus}
        onSessionInvalid={() => void refreshCashSession()}
      />
    );
  },
});

const historyRoute = createRoute({
  getParentRoute: () => statusBarRoute,
  path: "/history",
  beforeLoad: ({ context }) => requireSignedInPersonAnywhere(context),
  component: function HistoryRoute() {
    const {
      person,
      sessionOpen,
      signOut,
      salesHistory,
      saleHistoryDetail,
      reprintSaleReceipt,
      voidSale,
      authorizers,
      refreshCashSession,
    } = historyRoute.useRouteContext();
    const registerName = useRegisterName();
    return (
      <SalesHistoryScreen
        person={person}
        registerName={registerName}
        sessionOpen={sessionOpen}
        lock={signOut}
        salesHistory={salesHistory}
        saleHistoryDetail={saleHistoryDetail}
        reprintSaleReceipt={reprintSaleReceipt}
        voidSale={voidSale}
        loadAuthorizers={authorizers}
        onSessionInvalid={() => void refreshCashSession()}
      />
    );
  },
});

const cashRoute = createRoute({
  getParentRoute: () => statusBarRoute,
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
  getParentRoute: () => statusBarRoute,
  path: "/cash-count",
  validateSearch: (search: { leaving?: unknown }) => ({ leaving: search.leaving === true }),
  beforeLoad: ({ context }) => {
    const { id, person } = requireOpenSession(context);
    return { id, person };
  },
  component: function CashCountRoute() {
    const { id, person, signOut, cashBalance, cashCountPreview, closeCashSession } =
      cashCountRoute.useRouteContext();
    const registerName = useRegisterName();
    const { leaving } = cashCountRoute.useSearch();
    return (
      <CashCountScreen
        sessionId={id}
        registerName={registerName}
        abilities={person.abilities}
        lock={signOut}
        loadCashBalance={cashBalance}
        loadCashCountPreview={cashCountPreview}
        closeCashSession={(countedCash) => closeCashSession(person, id, countedCash, leaving)}
      />
    );
  },
});

const lockedRoute = createRoute({
  getParentRoute: () => statusBarRoute,
  path: "/locked",
  beforeLoad: ({ context }) => {
    const { openedBy } = requireLockedRegister(context);
    return { openedBy };
  },
  component: function LockedRoute() {
    const { openedBy, signIn } = lockedRoute.useRouteContext();
    const registerName = useRegisterName();
    return <LockedRegisterScreen opener={openedBy} registerName={registerName} signIn={signIn} />;
  },
});

const lockedCloseRoute = createRoute({
  getParentRoute: () => statusBarRoute,
  path: "/locked-close",
  beforeLoad: ({ context }) => {
    const { id, openedBy } = requireLockedRegister(context);
    return { id, openedBy };
  },
  component: function LockedCloseRoute() {
    const {
      id,
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
        NoPinStep={FirstSignInNoPin}
        CodeStep={FirstSignInCodeStep}
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

const updatingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/updating",
  beforeLoad: ({ context }) => requireRoute("/updating", context),
  component: RegisterUpdatingNotice,
});

const outOfServiceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/out-of-service",
  beforeLoad: ({ context }) => requireRoute("/out-of-service", context),
  component: OutOfServiceScreen,
});

const olderVersionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/older-version",
  beforeLoad: ({ context }) => requireRoute("/older-version", context),
  component: OlderVersionScreen,
});

export const routeTree = rootRoute.addChildren([
  sessionEyebrowRoute.addChildren([
    statusBarRoute.addChildren([
      signedInRoute,
      helpRoute,
      receiptPrinterRoute,
      serialDevicesRoute,
      initialCountRoute,
      openSessionRoute,
      startupPendingRoute,
      chargeRoute,
      historyRoute,
      cashRoute,
      cashCountRoute,
      lockedRoute,
      lockedCloseRoute,
    ]),
    signInRoute,
  ]),
  pinCodeRedemptionRoute,
  firstSignInRoute,
  enrollRoute,
  startingRoute,
  coreDownRoute,
  updatingRoute,
  outOfServiceRoute,
  olderVersionRoute,
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
    | "registerStatus"
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
    | "chargeSaleOnStandaloneTerminal"
    | "paymentMethodAvailability"
    | "startMercadoPagoCharge"
    | "followMercadoPagoCharge"
    | "abandonMercadoPagoCharge"
    | "searchProducts"
    | "addProduct"
    | "addWeighedProduct"
    | "weighProduct"
    | "changeLineQuantity"
    | "changeLineWeight"
    | "adjustSaleLine"
    | "previewSaleLineAdjustment"
    | "applySaleDiscount"
    | "previewSaleDiscount"
    | "removeSaleLine"
    | "cancelSale"
    | "cancelPaidSale"
    | "voidSale"
    | "receiptPrintStatus"
    | "printOriginalReceipt"
    | "convertPaidOrderIntoRefund"
    | "reprintSaleReceipt"
    | "salesHistory"
    | "saleHistoryDetail"
    | "readReceiptPrinter"
    | "setReceiptPrinter"
    | "readSerialDevices"
    | "registerSerialDevices"
    | "takeSerialDevicesOffer"
    | "startupPending"
    | "startupPendingGate"
    | "readClockGuard"
    | "correctRegisterClock"
    | "readInitialCount"
    | "recordInitialCountLine"
    | "withdrawInitialCountLine"
    | "findCountableProduct"
    | "searchCountableProducts"
    | "weighCountedProduct"
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
