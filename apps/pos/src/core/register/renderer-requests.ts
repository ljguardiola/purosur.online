import type {
  AddProductOutcome,
  Authorization,
  CashBalance,
  ChargeSaleInCashOutcome,
  CloseCashSessionOutcome,
  CloseLockedCashSessionOutcome,
  CoreToRendererMessage,
  CurrentSaleAnswer,
  EnrollmentOutcome,
  FirstPinCodeRequestOutcome,
  IdentifyLockedCloserOutcome,
  ListedCashMovement,
  OpenCashSession,
  OpenCashSessionOutcome,
  PinCodeRedemptionOutcome,
  RecordCashMovementOutcome,
  RendererToCoreMessage,
  ScanProductOutcome,
  SearchProductsOutcome,
  SignInLookupOutcome,
  SignInOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import type { ChargeSaleInCashRequest } from "../sales/sale-requests";
import type { CashMovementRequest } from "./cash-movement-requests";

export interface RendererRequestDeps {
  credentialsPresent: () => Promise<boolean>;
  registerName: () => string | undefined;
  enroll: (typedCode: string) => Promise<EnrollmentOutcome>;
  redeemPinCode: (typedCode: string, newPin: string) => Promise<PinCodeRedemptionOutcome>;
  signInUsers: (() => SignInUser[]) | undefined;
  signIn: ((userId: string, pin: string) => Promise<SignInOutcome>) | undefined;
  firstSignIn: ((userId: string, pin: string) => Promise<SignInOutcome>) | undefined;
  signInLookup: ((email: string) => Promise<SignInLookupOutcome>) | undefined;
  requestFirstPinCode: ((userId: string) => Promise<FirstPinCodeRequestOutcome>) | undefined;
  openCashSession: ((openingFloat: number) => Promise<OpenCashSessionOutcome>) | undefined;
  cashSession: (() => OpenCashSession | null) | undefined;
  recordCashMovement:
    | ((request: CashMovementRequest) => Promise<RecordCashMovementOutcome>)
    | undefined;
  cashMovements: (() => ListedCashMovement[] | null) | undefined;
  scanProduct: ((code: string) => Promise<ScanProductOutcome>) | undefined;
  chargeSaleInCash:
    | ((request: ChargeSaleInCashRequest) => Promise<ChargeSaleInCashOutcome>)
    | undefined;
  searchProducts: ((query: string) => Promise<SearchProductsOutcome>) | undefined;
  addProduct: ((productId: string) => Promise<AddProductOutcome>) | undefined;
  currentSale: (() => Promise<CurrentSaleAnswer>) | undefined;
  closeCashSession:
    | ((
        sessionId: string,
        countedCash: number,
        authorization: Authorization | undefined,
      ) => Promise<CloseCashSessionOutcome>)
    | undefined;
  closeLockedCashSession:
    | ((
        sessionId: string,
        countedCash: number,
        closer: Authorization,
      ) => Promise<CloseLockedCashSessionOutcome>)
    | undefined;
  identifyLockedCloser:
    | ((closer: Authorization) => Promise<IdentifyLockedCloserOutcome>)
    | undefined;
  cashBalance: (() => CashBalance | null) | undefined;
  authorizers: ((permission: AuthorizablePermissionKey) => SignInUser[]) | undefined;
  signOut: () => void;
  reportFailure: (context: string, error: unknown) => void;
}

function readSignInUsers(deps: RendererRequestDeps): SignInUser[] | undefined {
  try {
    return deps.signInUsers?.();
  } catch (error) {
    deps.reportFailure("reading the users who can sign in", error);
    return undefined;
  }
}

function readAuthorizers(
  deps: RendererRequestDeps,
  permission: AuthorizablePermissionKey,
): SignInUser[] | undefined {
  try {
    return deps.authorizers?.(permission);
  } catch (error) {
    deps.reportFailure("reading the people who can authorize", error);
    return undefined;
  }
}

async function attemptSignIn(
  deps: RendererRequestDeps,
  userId: string,
  pin: string,
): Promise<SignInOutcome> {
  try {
    return (await deps.signIn?.(userId, pin)) ?? { kind: "unavailable" };
  } catch (error) {
    deps.reportFailure("signing in", error);
    return { kind: "unavailable" };
  }
}

async function attemptFirstSignIn(
  deps: RendererRequestDeps,
  userId: string,
  pin: string,
): Promise<SignInOutcome> {
  try {
    return (await deps.firstSignIn?.(userId, pin)) ?? { kind: "unavailable" };
  } catch (error) {
    deps.reportFailure("signing in for the first time", error);
    return { kind: "unavailable" };
  }
}

// The failure is reported without its error: what a lookup fails on may carry the email typed.
async function attemptSignInLookup(
  deps: RendererRequestDeps,
  email: string,
): Promise<SignInLookupOutcome> {
  try {
    return (await deps.signInLookup?.(email)) ?? { kind: "unavailable" };
  } catch {
    deps.reportFailure("looking up who signs in", new Error("the lookup failed"));
    return { kind: "unavailable" };
  }
}

async function attemptFirstPinCodeRequest(
  deps: RendererRequestDeps,
  userId: string,
): Promise<FirstPinCodeRequestOutcome> {
  try {
    return (await deps.requestFirstPinCode?.(userId)) ?? { kind: "unavailable" };
  } catch (error) {
    deps.reportFailure("asking for a first PIN code", error);
    return { kind: "unavailable" };
  }
}

async function attemptOpenCashSession(
  deps: RendererRequestDeps,
  openingFloat: number,
): Promise<OpenCashSessionOutcome> {
  try {
    return (await deps.openCashSession?.(openingFloat)) ?? { kind: "unavailable" };
  } catch (error) {
    deps.reportFailure("opening a cash session", error);
    return { kind: "unavailable" };
  }
}

async function attemptCloseCashSession(
  deps: RendererRequestDeps,
  sessionId: string,
  countedCash: number,
  authorization: Authorization | undefined,
): Promise<CloseCashSessionOutcome> {
  try {
    return (
      (await deps.closeCashSession?.(sessionId, countedCash, authorization)) ?? {
        kind: "unavailable",
      }
    );
  } catch (error) {
    deps.reportFailure("closing a cash session", error);
    return { kind: "unavailable" };
  }
}

async function attemptCloseLockedCashSession(
  deps: RendererRequestDeps,
  sessionId: string,
  countedCash: number,
  closer: Authorization,
): Promise<CloseLockedCashSessionOutcome> {
  try {
    return (
      (await deps.closeLockedCashSession?.(sessionId, countedCash, closer)) ?? {
        kind: "unavailable",
      }
    );
  } catch (error) {
    deps.reportFailure("closing a locked register's cash session", error);
    return { kind: "unavailable" };
  }
}

async function attemptIdentifyLockedCloser(
  deps: RendererRequestDeps,
  closer: Authorization,
): Promise<IdentifyLockedCloserOutcome> {
  try {
    return (await deps.identifyLockedCloser?.(closer)) ?? { kind: "unavailable" };
  } catch (error) {
    deps.reportFailure("identifying who closes a locked register", error);
    return { kind: "unavailable" };
  }
}

function readCashBalance(deps: RendererRequestDeps): CashBalance | null | undefined {
  try {
    return deps.cashBalance?.();
  } catch (error) {
    deps.reportFailure("reading the cash balance", error);
    return undefined;
  }
}

function readCashSession(deps: RendererRequestDeps): OpenCashSession | null | undefined {
  try {
    return deps.cashSession?.();
  } catch (error) {
    deps.reportFailure("reading the open cash session", error);
    return undefined;
  }
}

async function attemptRecordCashMovement(
  deps: RendererRequestDeps,
  request: CashMovementRequest,
): Promise<RecordCashMovementOutcome> {
  try {
    return (await deps.recordCashMovement?.(request)) ?? { kind: "unavailable" };
  } catch (error) {
    deps.reportFailure("recording a cash movement", error);
    return { kind: "unavailable" };
  }
}

function readCashMovements(deps: RendererRequestDeps): ListedCashMovement[] | null | undefined {
  try {
    return deps.cashMovements?.();
  } catch (error) {
    deps.reportFailure("reading the cash movements", error);
    return undefined;
  }
}

async function attemptScanProduct(
  deps: RendererRequestDeps,
  code: string,
): Promise<ScanProductOutcome> {
  try {
    return (await deps.scanProduct?.(code)) ?? { kind: "unavailable" };
  } catch (error) {
    deps.reportFailure("scanning a product", error);
    return { kind: "unavailable" };
  }
}

async function attemptChargeSaleInCash(
  deps: RendererRequestDeps,
  request: ChargeSaleInCashRequest,
): Promise<ChargeSaleInCashOutcome> {
  try {
    return (await deps.chargeSaleInCash?.(request)) ?? { kind: "unavailable" };
  } catch (error) {
    deps.reportFailure("charging a sale in cash", error);
    return { kind: "unavailable" };
  }
}

async function attemptSearchProducts(
  deps: RendererRequestDeps,
  query: string,
): Promise<SearchProductsOutcome> {
  try {
    return (await deps.searchProducts?.(query)) ?? { kind: "unavailable" };
  } catch (error) {
    deps.reportFailure("searching products by name", error);
    return { kind: "unavailable" };
  }
}

async function attemptAddProduct(
  deps: RendererRequestDeps,
  productId: string,
): Promise<AddProductOutcome> {
  try {
    return (await deps.addProduct?.(productId)) ?? { kind: "unavailable" };
  } catch (error) {
    deps.reportFailure("adding a searched product", error);
    return { kind: "unavailable" };
  }
}

async function readCurrentSale(deps: RendererRequestDeps): Promise<CurrentSaleAnswer | undefined> {
  try {
    return await deps.currentSale?.();
  } catch (error) {
    deps.reportFailure("reading the sale in progress", error);
    return undefined;
  }
}

export async function answerRendererRequest(
  deps: RendererRequestDeps,
  message: RendererToCoreMessage,
): Promise<CoreToRendererMessage | undefined> {
  switch (message.type) {
    case "enrollment-status-request":
      return {
        type: "enrollment-status",
        request_id: message.request_id,
        enrolled: await deps.credentialsPresent(),
      };
    case "register-name-request":
      return {
        type: "register-name",
        request_id: message.request_id,
        name: deps.registerName() ?? null,
      };
    case "enroll":
      return {
        type: "enrollment-result",
        request_id: message.request_id,
        outcome: await deps.enroll(message.code),
      };
    case "redeem-pin-code":
      return {
        type: "pin-code-redemption-result",
        request_id: message.request_id,
        outcome: await deps.redeemPinCode(message.reset_code, message.new_pin),
      };
    case "sign-in-users": {
      const users = readSignInUsers(deps);
      return users === undefined
        ? { type: "sign-in-users-unavailable", request_id: message.request_id }
        : { type: "sign-in-users", request_id: message.request_id, users };
    }
    case "sign-in":
      return {
        type: "sign-in-result",
        request_id: message.request_id,
        outcome: await attemptSignIn(deps, message.user_id, message.pin),
      };
    case "first-sign-in":
      return {
        type: "sign-in-result",
        request_id: message.request_id,
        outcome: await attemptFirstSignIn(deps, message.user_id, message.pin),
      };
    case "sign-in-lookup":
      return {
        type: "sign-in-lookup-result",
        request_id: message.request_id,
        outcome: await attemptSignInLookup(deps, message.email),
      };
    case "first-pin-code-request":
      return {
        type: "first-pin-code-request-result",
        request_id: message.request_id,
        outcome: await attemptFirstPinCodeRequest(deps, message.user_id),
      };
    case "open-cash-session":
      return {
        type: "open-cash-session-result",
        request_id: message.request_id,
        outcome: await attemptOpenCashSession(deps, message.opening_float),
      };
    case "cash-session-request": {
      const session = readCashSession(deps);
      return session === undefined
        ? { type: "cash-session-unavailable", request_id: message.request_id }
        : { type: "cash-session", request_id: message.request_id, session };
    }
    case "record-cash-movement":
      return {
        type: "record-cash-movement-result",
        request_id: message.request_id,
        outcome: await attemptRecordCashMovement(deps, {
          kind: message.kind,
          amount: message.amount,
          reason: message.reason,
          authorization: message.authorization,
        }),
      };
    case "cash-movements-request": {
      const movements = readCashMovements(deps);
      return movements === undefined
        ? { type: "cash-movements-unavailable", request_id: message.request_id }
        : { type: "cash-movements", request_id: message.request_id, movements };
    }
    case "scan-product":
      return {
        type: "scan-product-result",
        request_id: message.request_id,
        outcome: await attemptScanProduct(deps, message.code),
      };
    case "charge-sale-in-cash":
      return {
        type: "charge-sale-in-cash-result",
        request_id: message.request_id,
        outcome: await attemptChargeSaleInCash(deps, {
          saleId: message.sale_id,
          tendered: message.tendered,
        }),
      };
    case "search-products":
      return {
        type: "search-products-result",
        request_id: message.request_id,
        outcome: await attemptSearchProducts(deps, message.query),
      };
    case "add-product":
      return {
        type: "add-product-result",
        request_id: message.request_id,
        outcome: await attemptAddProduct(deps, message.product_id),
      };
    case "sale-request": {
      const sale = await readCurrentSale(deps);
      if (sale === "not_permitted") {
        return { type: "sale-not-permitted", request_id: message.request_id };
      }
      return sale === undefined
        ? { type: "sale-unavailable", request_id: message.request_id }
        : { type: "sale", request_id: message.request_id, sale };
    }
    case "close-cash-session":
      return {
        type: "close-cash-session-result",
        request_id: message.request_id,
        outcome: await attemptCloseCashSession(
          deps,
          message.session_id,
          message.counted_cash,
          message.authorization,
        ),
      };
    case "close-locked-cash-session":
      return {
        type: "close-locked-cash-session-result",
        request_id: message.request_id,
        outcome: await attemptCloseLockedCashSession(
          deps,
          message.session_id,
          message.counted_cash,
          message.closer,
        ),
      };
    case "identify-locked-closer":
      return {
        type: "identify-locked-closer-result",
        request_id: message.request_id,
        outcome: await attemptIdentifyLockedCloser(deps, message.closer),
      };
    case "cash-balance-request": {
      const balance = readCashBalance(deps);
      return balance === undefined
        ? { type: "cash-balance-unavailable", request_id: message.request_id }
        : { type: "cash-balance", request_id: message.request_id, balance };
    }
    case "authorizers": {
      const users = readAuthorizers(deps, message.permission);
      return users === undefined
        ? { type: "authorizers-unavailable", request_id: message.request_id }
        : { type: "authorizers", request_id: message.request_id, users };
    }
    case "sign-out":
      deps.signOut();
      return { type: "signed-out", request_id: message.request_id };
    case "ping":
      return undefined;
  }
}
