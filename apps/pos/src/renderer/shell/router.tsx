import type {
  AbandonMercadoPagoChargeOutcome,
  AddProductOutcome,
  AddWeighedProductOutcome,
  AdjustSaleLineOutcome,
  AnswerReceiptQuestionOutcome,
  ApplySaleDiscountOutcome,
  Authorization,
  CancelLockedSaleOutcome,
  CancelPaidSaleOutcome,
  CancelSaleOutcome,
  CashBalance,
  CashChargeAmountsAnswer,
  CashChargeAnswer,
  CashCountPreview,
  ChangeLineQuantityOutcome,
  ChangeLineWeightOutcome,
  ChargeSaleByTransferOutcome,
  ChargeSaleInCashOutcome,
  ChargeSaleInCashWithChangeDiscountOutcome,
  ChargeSaleOnStandaloneTerminalOutcome,
  ChargeSaleWithPaidOrderOutcome,
  CloseCashSessionOutcome,
  CloseLockedCashSessionOutcome,
  CompleteReturnOutcome,
  ConvertPaidOrderIntoRefundOutcome,
  CoreStatusMessage,
  CorrectRegisterClockOutcome,
  CurrentSaleAnswer,
  DiscardContingencyBackupTicketsAnswer,
  EnrollmentOutcome,
  EnrollmentStandingAnswer,
  FindCountableProductOutcome,
  FindDeferredSaleOutcome,
  FindProductByCodeOutcome,
  FindSaleForReturnOutcome,
  FirstPinCodeRequestOutcome,
  FollowMercadoPagoChargeOutcome,
  IdentifyLockedCloserOutcome,
  ListedCashMovement,
  ManualAdjustmentRequest,
  OpenCashSessionOutcome,
  OpeningFloatSuggestion,
  PaymentMethodAvailability,
  PinCodeRedemptionOutcome,
  PinPolicy,
  PreviewReturnOutcome,
  PreviewSaleDiscountOutcome,
  PreviewSaleLineAdjustmentOutcome,
  PrintCreditNoteOutcome,
  PrintDeferredSaleInvoiceOutcome,
  PrintOriginalReceiptOutcome,
  ReadClockGuardOutcome,
  ReadContingencyBackupTicketOfSaleOutcome,
  ReadContingencyBackupTicketsOutcome,
  ReadInitialCountOutcome,
  ReadReceiptPrinterOutcome,
  ReadSerialDevicesOutcome,
  RebuildSaleAgainstPaidOrderOutcome,
  ReceiptPrintStatusOutcome,
  RecordableCashMovementKinds,
  RecordCashMovementOutcome,
  RecordInitialCountLineOutcome,
  RegisterSerialDevicesOutcome,
  RegisterStatus,
  RemoveSaleLineOutcome,
  ReprintSaleReceiptOutcome,
  RestorationStandingAnswer,
  ReturnDraftLineBody,
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
  WeighLineOutcome,
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
import { EnrollmentScreen, ReEnrollmentScreen } from "../installation/enrollment-screen";
import { OutOfServiceScreen } from "../installation/out-of-service-screen";
import { RevokedInstallationScreen } from "../installation/revoked-installation-screen";
import type {
  CashMovementInput,
  CompleteReturnInput,
  DeferredSaleReading,
  MercadoPagoChargeKind,
  SaleForReturnReading,
  SalesHistoryQuery,
  SerialDevicesToRegister,
  SignInUsers,
} from "../platform/core-client";
import { CashCountScreen } from "../register/cash-count-screen";
import { CashScreen } from "../register/cash-screen";
import type { CashSessionState } from "../register/cash-session-state";
import { LockedCloseScreen } from "../register/locked-close-screen";
import { LockedRegisterScreen } from "../register/locked-register-screen";
import { NoSessionScreen } from "../register/no-session-screen";
import { OlderVersionScreen } from "../register/older-version-screen";
import { ReceiptPrinterScreen } from "../register/receipt-printer-screen";
import type { StartupPendingAnswer } from "../register/register-queries";
import {
  registerNameQueryOptions,
  registerStatusQueryOptions,
  startupPendingQueryOptions,
  useRegisterNameQuery,
  useRegisterStatusQuery,
  useRegisterVersionQuery,
} from "../register/register-queries";
import { RestoreRequiredScreen } from "../register/restore-required-screen";
import type { RestoringStanding } from "../register/restoring-screen";
import { RestoringScreen } from "../register/restoring-screen";
import { mayConfigureSerialDevices } from "../register/serial-devices-offer";
import { SerialDevicesScreen } from "../register/serial-devices-screen";
import { StartupPendingScreen } from "../register/startup-pending-screen";
import { ReturnScreen } from "../returns/return-screen";
import { KEYED_CHARGE_METHODS } from "../sales/charge-method-options";
import { ChargeScreen } from "../sales/charge-screen";
import { DeferredSaleScreen } from "../sales/deferred-sale-screen";
import { SaleScreen } from "../sales/sale-screen";
import { SalesHistoryScreen } from "../sales/sales-history-screen";
import { FirstSignInScreen } from "../sessions/first-sign-in-screen";
import { SignInScreen } from "../sessions/sign-in-screen";
import { InitialCountOffer } from "../stock/initial-count-offer";
import { InitialCountScreen } from "../stock/initial-count-screen";
import { initialCountQueryOptions } from "../stock/stock-queries";
import { BrandPanelScreen } from "./brand-panel-screen";
import { CoreDownNotice } from "./core-down-notice";
import { RegisterStatusLayout } from "./register-status-layout";
import { RegisterUpdatingNotice } from "./register-updating-notice";
import type { SignedInPerson } from "./signed-in-person";
import type { StartupPendingGate } from "./startup-pending-gate";

export type CoreStatus = CoreStatusMessage["status"];

export type Enrollment = "unknown" | EnrollmentStandingAnswer["kind"];

export type Restoration = RestorationStandingAnswer | "unknown";

export type RegisterServiceState = "unknown" | "in_service" | "out_of_service";

export interface RouterContext {
  queryClient: QueryClient;
  coreStatus: CoreStatus;
  registerService: RegisterServiceState;
  restoration: Restoration;
  enrollment: Enrollment;
  person: SignedInPerson | undefined;
  cashSession: CashSessionState;
  enroll: (typedCode: string) => Promise<EnrollmentOutcome>;
  signInUsers: () => Promise<SignInUsers>;
  authorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  lockedClosers: () => Promise<SignInUser[]>;
  signIn: (userId: string, pin: string) => Promise<SignInOutcome>;
  registerName: () => Promise<string | null>;
  registerVersion: () => Promise<string | null>;
  signOut: () => void;
  openCashSession: (openingFloat: number) => Promise<OpenCashSessionOutcome>;
  openingFloatSuggestion: () => Promise<OpeningFloatSuggestion | null | "unavailable">;
  closeCashSession: (
    person: SignedInPerson,
    sessionId: string,
    countedCash: number,
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
  cashCharge: (
    saleId: string,
    tendered: number,
    saleDiscount?: number,
  ) => Promise<CashChargeAnswer>;
  cashChargeAmounts: (
    saleId: string,
    saleDiscount?: number,
  ) => Promise<CashChargeAmountsAnswer | null>;
  chargeSaleInCash: (saleId: string, tendered: number) => Promise<ChargeSaleInCashOutcome>;
  chargeSaleInCashWithChangeDiscount: (
    saleId: string,
    tendered: number,
    discountAmount: number,
    authorization: Authorization | undefined,
  ) => Promise<ChargeSaleInCashWithChangeDiscountOutcome>;
  chargeSaleByTransfer: (saleId: string, amount: number) => Promise<ChargeSaleByTransferOutcome>;
  chargeSaleOnStandaloneTerminal: (
    saleId: string,
    amount: number,
  ) => Promise<ChargeSaleOnStandaloneTerminalOutcome>;
  paymentMethodAvailability: () => Promise<PaymentMethodAvailability | null>;
  startMercadoPagoCharge: (
    saleId: string,
    charge: MercadoPagoChargeKind,
    amount: number,
  ) => Promise<StartMercadoPagoChargeOutcome>;
  followMercadoPagoCharge: (
    paymentTransactionId: string,
  ) => Promise<FollowMercadoPagoChargeOutcome>;
  abandonMercadoPagoCharge: (
    paymentTransactionId: string,
  ) => Promise<AbandonMercadoPagoChargeOutcome>;
  searchProducts: (query: string) => Promise<SearchProductsOutcome>;
  findProductByCode: (code: string) => Promise<FindProductByCodeOutcome>;
  addProduct: (productId: string) => Promise<AddProductOutcome>;
  addWeighedProduct: (
    productId: string,
    weightThousandths: number,
  ) => Promise<AddWeighedProductOutcome>;
  weighProduct: (
    productId: string,
    confirmedWeightThousandths: number | null,
  ) => Promise<WeighProductOutcome>;
  weighLine: (
    lineId: string,
    expectedWeightThousandths: number,
    confirmedWeightThousandths: number | null,
  ) => Promise<WeighLineOutcome>;
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
  answerReceiptQuestion: (saleId: string, print: boolean) => Promise<AnswerReceiptQuestionOutcome>;
  contingencyBackupTickets: () => Promise<ReadContingencyBackupTicketsOutcome>;
  contingencyBackupTicketOfSale: (
    saleId: string,
  ) => Promise<ReadContingencyBackupTicketOfSaleOutcome>;
  discardContingencyBackupTickets: () => Promise<DiscardContingencyBackupTicketsAnswer>;
  printOriginalReceipt: (saleId: string) => Promise<PrintOriginalReceiptOutcome>;
  findDeferredSale: (reading: DeferredSaleReading) => Promise<FindDeferredSaleOutcome>;
  findSaleForReturn: (
    reading: SaleForReturnReading,
    authorization: Authorization | undefined,
  ) => Promise<FindSaleForReturnOutcome>;
  previewReturn: (
    saleId: string,
    lines: readonly ReturnDraftLineBody[],
  ) => Promise<PreviewReturnOutcome>;
  completeReturn: (input: CompleteReturnInput) => Promise<CompleteReturnOutcome>;
  printDeferredSaleInvoice: (saleId: string) => Promise<PrintDeferredSaleInvoiceOutcome>;
  reprintDeferredSaleInvoice: (
    saleId: string,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ReprintSaleReceiptOutcome>;
  printCreditNote: (saleId: string, creditNoteId: string) => Promise<PrintCreditNoteOutcome>;
  reprintCreditNote: (
    saleId: string,
    creditNoteId: string,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ReprintSaleReceiptOutcome>;
  convertPaidOrderIntoRefund: (
    paymentTransactionId: string,
  ) => Promise<ConvertPaidOrderIntoRefundOutcome>;
  rebuildSaleAgainstPaidOrder: (
    paymentTransactionId: string,
  ) => Promise<RebuildSaleAgainstPaidOrderOutcome>;
  chargeSaleWithPaidOrder: (saleId: string) => Promise<ChargeSaleWithPaidOrderOutcome>;
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
  weighCountedProduct: (
    productId: string,
    confirmedWeightThousandths: number | null,
  ) => Promise<WeighCountedProductOutcome>;
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
  | "/restoring"
  | "/restore-required"
  | "/revoked"
  | "/older-version";

// Until the core says whether the register is in service and then whether this installation is
// enrolled, the register stays on the brand panel instead of guessing which screen comes next. The
// same goes for whether a cash session is open, which decides between signing in and resuming it.
export function routeFor({
  coreStatus,
  registerService,
  restoration,
  enrollment,
  person,
  cashSession,
}: Pick<
  RouterContext,
  "coreStatus" | "registerService" | "restoration" | "enrollment" | "person" | "cashSession"
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
  if (enrollment === "not_enrolled") {
    return "/enroll";
  }
  if (enrollment === "revoked" && person === undefined) {
    return "/revoked";
  }
  if (restoration === "unknown") {
    return "/starting";
  }
  if (restoration.kind === "in_progress") {
    return restoration.step === "enroll" ? "/restore-required" : "/restoring";
  }
  if (restoration.kind === "without_connection" || restoration.kind === "failed") {
    return "/restoring";
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

function requireRestoringStanding(context: RouterContext): {
  restoringStanding: RestoringStanding;
} {
  const route = routeFor(context);
  const { restoration } = context;
  if (
    route !== "/restoring" ||
    restoration === "unknown" ||
    restoration.kind === "completed" ||
    (restoration.kind === "in_progress" && restoration.step === "enroll")
  ) {
    throw redirect({ to: route });
  }
  return { restoringStanding: restoration };
}

function requireLockedRegister(context: RouterContext) {
  if (context.cashSession.status !== "open" || routeFor(context) !== "/locked") {
    throw redirect({ to: routeFor(context) });
  }
  return context.cashSession;
}

function RootScreen() {
  return (
    <div className="h-screen w-full">
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

function useRegisterVersion() {
  const { registerVersion } = rootRoute.useRouteContext();
  return useRegisterVersionQuery(registerVersion);
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

const registerStatusRoute = createRoute({
  getParentRoute: () => sessionEyebrowRoute,
  id: "register-status",
  component: function RegisterStatusRoute() {
    const {
      person,
      registerName,
      cashSession,
      registerStatus,
      contingencyBackupTickets,
      discardContingencyBackupTickets,
    } = registerStatusRoute.useRouteContext();
    return (
      <RegisterStatusLayout
        person={person}
        readRegisterName={registerName}
        cashSession={cashSession}
        readStatus={registerStatus}
        readBackupTickets={contingencyBackupTickets}
        discardBackupTickets={discardContingencyBackupTickets}
      />
    );
  },
});

const signedInRoute = createRoute({
  getParentRoute: () => registerStatusRoute,
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
      openingFloatSuggestion,
      readInitialCount,
      readClockGuard,
      correctRegisterClock,
      refreshCashSession,
    } = signedInRoute.useRouteContext();
    const registerName = useRegisterName();
    return (
      <NoSessionScreen
        person={person}
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
        readOpeningFloatSuggestion={openingFloatSuggestion}
      />
    );
  },
});

const receiptPrinterRoute = createRoute({
  getParentRoute: () => registerStatusRoute,
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
    return (
      <ReceiptPrinterScreen
        person={person}
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
  getParentRoute: () => registerStatusRoute,
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
    const navigate = serialDevicesRoute.useNavigate();
    return (
      <SerialDevicesScreen
        person={person}
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
  getParentRoute: () => registerStatusRoute,
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
  component: InitialCountRoute,
});

function InitialCountRoute() {
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
}

const openSessionRoute = createRoute({
  getParentRoute: () => registerStatusRoute,
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
      findProductByCode,
      addProduct,
      addWeighedProduct,
      weighProduct,
      weighLine,
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
    const status = useRegisterStatusQuery(registerStatus);
    return (
      <SaleScreen
        sessionId={id}
        person={person}
        lock={signOut}
        currentSale={currentSale}
        scanProduct={scanProduct}
        searchProducts={searchProducts}
        findProductByCode={findProductByCode}
        addProduct={addProduct}
        addWeighedProduct={addWeighedProduct}
        weighProduct={weighProduct}
        weighLine={weighLine}
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
  getParentRoute: () => registerStatusRoute,
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
  component: StartupPendingRoute,
});

function StartupPendingRoute() {
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
    rebuildSaleAgainstPaidOrder,
    authorizers,
    readClockGuard,
    correctRegisterClock,
    refreshCashSession,
  } = startupPendingRoute.useRouteContext();
  const registerName = useRegisterName();
  const navigate = startupPendingRoute.useNavigate();
  const router = useRouter();
  const goToSale = () => {
    startupPendingGate.dismiss();
    void navigate({ to: "/session" });
  };
  return (
    <StartupPendingScreen
      sessionId={id}
      person={person}
      sessionOwner={openedBy}
      openedAt={openedAt}
      lock={signOut}
      loadStartupPending={startupPending}
      loadCashBalance={cashBalance}
      printOriginalReceipt={printOriginalReceipt}
      reprintSaleReceipt={reprintSaleReceipt}
      convertPaidOrderIntoRefund={convertPaidOrderIntoRefund}
      rebuildSaleAgainstPaidOrder={rebuildSaleAgainstPaidOrder}
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
      onGoSelling={goToSale}
      onGoToSale={goToSale}
      onNothingLeft={() => void router.invalidate()}
      onSessionInvalid={() => void refreshCashSession()}
    />
  );
}

const chargeRoute = createRoute({
  getParentRoute: () => registerStatusRoute,
  path: "/charge",
  validateSearch: (search: { method?: unknown }) => {
    const method = KEYED_CHARGE_METHODS.find((keyed) => keyed === search.method);
    return method === undefined ? {} : { method };
  },
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
      cashChargeAmounts,
      chargeSaleInCash,
      chargeSaleInCashWithChangeDiscount,
      authorizers,
      chargeSaleByTransfer,
      chargeSaleOnStandaloneTerminal,
      chargeSaleWithPaidOrder,
      paymentMethodAvailability,
      startMercadoPagoCharge,
      followMercadoPagoCharge,
      abandonMercadoPagoCharge,
      receiptPrintStatus,
      answerReceiptQuestion,
      contingencyBackupTicketOfSale,
      contingencyBackupTickets,
      refreshCashSession,
    } = chargeRoute.useRouteContext();
    const { method } = chargeRoute.useSearch();
    return (
      <ChargeScreen
        sessionId={id}
        {...(method === undefined ? {} : { method })}
        person={person}
        lock={signOut}
        currentSale={currentSale}
        cashCharge={cashCharge}
        cashChargeAmounts={cashChargeAmounts}
        chargeSaleInCash={chargeSaleInCash}
        chargeSaleInCashWithChangeDiscount={chargeSaleInCashWithChangeDiscount}
        loadAuthorizers={authorizers}
        chargeSaleByTransfer={chargeSaleByTransfer}
        chargeSaleOnStandaloneTerminal={chargeSaleOnStandaloneTerminal}
        chargeSaleWithPaidOrder={chargeSaleWithPaidOrder}
        paymentMethodAvailability={paymentMethodAvailability}
        startMercadoPagoCharge={startMercadoPagoCharge}
        followMercadoPagoCharge={followMercadoPagoCharge}
        abandonMercadoPagoCharge={abandonMercadoPagoCharge}
        receiptPrintStatus={receiptPrintStatus}
        answerReceiptQuestion={answerReceiptQuestion}
        contingencyBackupTicketOfSale={contingencyBackupTicketOfSale}
        contingencyBackupTickets={contingencyBackupTickets}
        onSessionInvalid={() => void refreshCashSession()}
      />
    );
  },
});

const historyRoute = createRoute({
  getParentRoute: () => registerStatusRoute,
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
      printOriginalReceipt,
      voidSale,
      printCreditNote,
      reprintCreditNote,
      reprintDeferredSaleInvoice,
      authorizers,
      refreshCashSession,
    } = historyRoute.useRouteContext();
    return (
      <SalesHistoryScreen
        person={person}
        sessionOpen={sessionOpen}
        lock={signOut}
        salesHistory={salesHistory}
        saleHistoryDetail={saleHistoryDetail}
        reprintSaleReceipt={reprintSaleReceipt}
        printOriginalReceipt={printOriginalReceipt}
        voidSale={voidSale}
        printCreditNote={printCreditNote}
        reprintCreditNote={reprintCreditNote}
        reprintDeferredSaleInvoice={reprintDeferredSaleInvoice}
        loadAuthorizers={authorizers}
        onSessionInvalid={() => void refreshCashSession()}
      />
    );
  },
});

const deferredSaleRoute = createRoute({
  getParentRoute: () => registerStatusRoute,
  path: "/deferred-sale",
  beforeLoad: ({ context }) => requireSignedInPersonAnywhere(context),
  component: function DeferredSaleRoute() {
    const {
      person,
      sessionOpen,
      signOut,
      findDeferredSale,
      printDeferredSaleInvoice,
      reprintDeferredSaleInvoice,
      authorizers,
      refreshCashSession,
    } = deferredSaleRoute.useRouteContext();
    return (
      <DeferredSaleScreen
        person={person}
        sessionOpen={sessionOpen}
        lock={signOut}
        findDeferredSale={findDeferredSale}
        printDeferredSaleInvoice={printDeferredSaleInvoice}
        reprintDeferredSaleInvoice={reprintDeferredSaleInvoice}
        loadAuthorizers={authorizers}
        onSessionInvalid={() => void refreshCashSession()}
      />
    );
  },
});

const returnRoute = createRoute({
  getParentRoute: () => registerStatusRoute,
  path: "/return",
  beforeLoad: ({ context }) => {
    const { person } = requireOpenSession(context);
    return { person };
  },
  component: function ReturnRoute() {
    const {
      person,
      signOut,
      findSaleForReturn,
      previewReturn,
      completeReturn,
      authorizers,
      refreshCashSession,
    } = returnRoute.useRouteContext();
    const registerName = useRegisterName();
    return (
      <ReturnScreen
        person={person}
        registerName={registerName}
        lock={signOut}
        findSaleForReturn={findSaleForReturn}
        previewReturn={previewReturn}
        completeReturn={completeReturn}
        loadAuthorizers={authorizers}
        onSessionInvalid={() => void refreshCashSession()}
      />
    );
  },
});

const cashRoute = createRoute({
  getParentRoute: () => registerStatusRoute,
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
      readClockGuard,
      correctRegisterClock,
      refreshCashSession,
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
        clockGuard={
          <ClockGuardOffer
            registerName={registerName}
            cashSessionOpen
            readClockGuard={readClockGuard}
            correctRegisterClock={correctRegisterClock}
            onSessionInvalid={() => void refreshCashSession()}
          />
        }
      />
    );
  },
});

const cashCountRoute = createRoute({
  getParentRoute: () => registerStatusRoute,
  path: "/cash-count",
  beforeLoad: ({ context }) => {
    const { id, person } = requireOpenSession(context);
    return { id, person };
  },
  component: function CashCountRoute() {
    const { id, person, signOut, cashBalance, cashCountPreview, closeCashSession } =
      cashCountRoute.useRouteContext();
    return (
      <CashCountScreen
        sessionId={id}
        abilities={person.abilities}
        lock={signOut}
        loadCashBalance={cashBalance}
        loadCashCountPreview={cashCountPreview}
        closeCashSession={(countedCash) => closeCashSession(person, id, countedCash)}
      />
    );
  },
});

const lockedRoute = createRoute({
  getParentRoute: () => registerStatusRoute,
  path: "/locked",
  beforeLoad: ({ context }) => {
    const { openedBy } = requireLockedRegister(context);
    return { openedBy };
  },
  component: function LockedRoute() {
    const { openedBy, signIn } = lockedRoute.useRouteContext();
    const registerName = useRegisterName();
    const version = useRegisterVersion();
    return (
      <LockedRegisterScreen
        opener={openedBy}
        registerName={registerName}
        version={version}
        signIn={signIn}
      />
    );
  },
});

const lockedCloseRoute = createRoute({
  getParentRoute: () => registerStatusRoute,
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
    const version = useRegisterVersion();
    return (
      <LockedCloseScreen
        sessionId={id}
        opener={openedBy}
        registerName={registerName}
        version={version}
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
    const version = useRegisterVersion();
    return <SignInScreen loadUsers={signInUsers} signIn={signIn} version={version} />;
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
    const version = useRegisterVersion();
    return <EnrollmentScreen checkCode={checkEnrollmentCode} enroll={enroll} version={version} />;
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

const restoringRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/restoring",
  beforeLoad: ({ context }) => requireRestoringStanding(context),
  component: function RestoringRoute() {
    const { restoringStanding } = restoringRoute.useRouteContext();
    return (
      <RestoringScreen
        registerName={useRegisterName()}
        version={useRegisterVersion()}
        standing={restoringStanding}
      />
    );
  },
});

const restoreRequiredRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/restore-required",
  beforeLoad: ({ context }) => requireRoute("/restore-required", context),
  component: function RestoreRequiredRoute() {
    const navigate = restoreRequiredRoute.useNavigate();
    return (
      <RestoreRequiredScreen
        registerName={useRegisterName()}
        version={useRegisterVersion()}
        onEnroll={() => void navigate({ to: "/re-enroll" })}
      />
    );
  },
});

const revokedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/revoked",
  beforeLoad: ({ context }) => requireRoute("/revoked", context),
  component: function RevokedRoute() {
    const navigate = revokedRoute.useNavigate();
    return (
      <RevokedInstallationScreen
        registerName={useRegisterName()}
        version={useRegisterVersion()}
        onEnroll={() => void navigate({ to: "/re-enroll" })}
      />
    );
  },
});

const reEnrollRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/re-enroll",
  beforeLoad: ({ context }) => requireRoute(["/restore-required", "/revoked"], context),
  component: function ReEnrollRoute() {
    const context = reEnrollRoute.useRouteContext();
    const { enroll, checkEnrollmentCode } = context;
    const navigate = reEnrollRoute.useNavigate();
    return (
      <ReEnrollmentScreen
        registerName={useRegisterName()}
        checkCode={checkEnrollmentCode}
        enroll={enroll}
        onBack={() => void navigate({ to: routeFor(context) })}
        version={useRegisterVersion()}
      />
    );
  },
});

const olderVersionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/older-version",
  beforeLoad: ({ context }) => requireRoute("/older-version", context),
  component: OlderVersionScreen,
});

export const routeTree = rootRoute.addChildren([
  sessionEyebrowRoute.addChildren([
    registerStatusRoute.addChildren([
      signedInRoute,
      receiptPrinterRoute,
      serialDevicesRoute,
      initialCountRoute,
      openSessionRoute,
      startupPendingRoute,
      chargeRoute,
      historyRoute,
      deferredSaleRoute,
      returnRoute,
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
  restoringRoute,
  restoreRequiredRoute,
  reEnrollRoute,
  revokedRoute,
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
    | "registerVersion"
    | "signInUsers"
    | "signIn"
    | "signOut"
    | "openCashSession"
    | "openingFloatSuggestion"
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
    | "cashChargeAmounts"
    | "chargeSaleInCash"
    | "chargeSaleInCashWithChangeDiscount"
    | "chargeSaleByTransfer"
    | "chargeSaleOnStandaloneTerminal"
    | "paymentMethodAvailability"
    | "startMercadoPagoCharge"
    | "followMercadoPagoCharge"
    | "abandonMercadoPagoCharge"
    | "searchProducts"
    | "findProductByCode"
    | "addProduct"
    | "addWeighedProduct"
    | "weighProduct"
    | "weighLine"
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
    | "answerReceiptQuestion"
    | "contingencyBackupTickets"
    | "contingencyBackupTicketOfSale"
    | "discardContingencyBackupTickets"
    | "printOriginalReceipt"
    | "findDeferredSale"
    | "findSaleForReturn"
    | "previewReturn"
    | "completeReturn"
    | "printDeferredSaleInvoice"
    | "reprintDeferredSaleInvoice"
    | "printCreditNote"
    | "reprintCreditNote"
    | "convertPaidOrderIntoRefund"
    | "rebuildSaleAgainstPaidOrder"
    | "chargeSaleWithPaidOrder"
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
      restoration: "unknown",
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
