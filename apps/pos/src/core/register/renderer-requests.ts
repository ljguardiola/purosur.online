import type {
  CoreToRendererMessage,
  EnrollmentOutcome,
  OpenCashSession,
  OpenCashSessionOutcome,
  PinCodeRedemptionOutcome,
  RendererToCoreMessage,
  SignInOutcome,
  SignInUser,
} from "@purosur/contracts";

export interface RendererRequestDeps {
  credentialsPresent: () => Promise<boolean>;
  registerName: () => string | undefined;
  enroll: (typedCode: string) => Promise<EnrollmentOutcome>;
  redeemPinCode: (typedCode: string, newPin: string) => Promise<PinCodeRedemptionOutcome>;
  signInUsers: (() => SignInUser[]) | undefined;
  signIn: ((userId: string, pin: string) => Promise<SignInOutcome>) | undefined;
  openCashSession:
    | ((userId: string, openingFloat: number) => Promise<OpenCashSessionOutcome>)
    | undefined;
  cashSession: (() => OpenCashSession | null) | undefined;
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

async function attemptOpenCashSession(
  deps: RendererRequestDeps,
  userId: string,
  openingFloat: number,
): Promise<OpenCashSessionOutcome> {
  try {
    return (await deps.openCashSession?.(userId, openingFloat)) ?? { kind: "unavailable" };
  } catch (error) {
    deps.reportFailure("opening a cash session", error);
    return { kind: "unavailable" };
  }
}

function readCashSession(deps: RendererRequestDeps): OpenCashSession | null {
  try {
    return deps.cashSession?.() ?? null;
  } catch (error) {
    deps.reportFailure("reading the open cash session", error);
    return null;
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
    case "open-cash-session":
      return {
        type: "open-cash-session-result",
        request_id: message.request_id,
        outcome: await attemptOpenCashSession(deps, message.user_id, message.opening_float),
      };
    case "cash-session-request":
      return {
        type: "cash-session",
        request_id: message.request_id,
        session: readCashSession(deps),
      };
    case "ping":
      return undefined;
  }
}
