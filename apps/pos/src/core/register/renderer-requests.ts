import type {
  CoreToRendererMessage,
  EnrollmentOutcome,
  OpenCashSession,
  OpenCashSessionOutcome,
  PinCodeRedemptionOutcome,
  RendererToCoreMessage,
  SignInLookupOutcome,
  SignInOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";

export interface RendererRequestDeps {
  credentialsPresent: () => Promise<boolean>;
  registerName: () => string | undefined;
  enroll: (typedCode: string) => Promise<EnrollmentOutcome>;
  redeemPinCode: (typedCode: string, newPin: string) => Promise<PinCodeRedemptionOutcome>;
  signInUsers: (() => SignInUser[]) | undefined;
  signIn: ((userId: string, pin: string) => Promise<SignInOutcome>) | undefined;
  firstSignIn: ((userId: string, pin: string) => Promise<SignInOutcome>) | undefined;
  signInLookup: ((email: string) => Promise<SignInLookupOutcome>) | undefined;
  openCashSession: ((openingFloat: number) => Promise<OpenCashSessionOutcome>) | undefined;
  cashSession: (() => OpenCashSession | null) | undefined;
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

function readCashSession(deps: RendererRequestDeps): OpenCashSession | null | undefined {
  try {
    return deps.cashSession?.();
  } catch (error) {
    deps.reportFailure("reading the open cash session", error);
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
