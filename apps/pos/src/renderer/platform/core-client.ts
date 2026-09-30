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
import { coreToRendererMessageSchema } from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";

export interface CorePort {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  start(): void;
  close(): void;
}

export interface CoreClient {
  connect(port: CorePort): void;
  enrollmentStatus(): Promise<boolean>;
  registerName(): Promise<string | null>;
  enroll(typedCode: string): Promise<EnrollmentOutcome>;
  redeemPinCode(typedCode: string, newPin: string): Promise<PinCodeRedemptionOutcome>;
  signInUsers(): Promise<SignInUser[]>;
  authorizers(permission: AuthorizablePermissionKey): Promise<SignInUser[]>;
  signIn(userId: string, pin: string): Promise<SignInOutcome>;
  signOut(): Promise<void>;
  openCashSession(openingFloat: number): Promise<OpenCashSessionOutcome>;
  cashSession(): Promise<OpenCashSession | null | "unavailable">;
  onPulled(listener: () => void): () => void;
}

type CoreRequest = Exclude<RendererToCoreMessage, { type: "ping" }>;

type CoreAnswer = Exclude<CoreToRendererMessage, { type: "pulled" }>;

interface PendingRequest {
  message: CoreRequest;
  settle(answer: CoreAnswer): boolean;
  fail(error: Error): void;
}

export function createCoreClient(deps: { newRequestId: () => string }): CoreClient {
  let current: CorePort | undefined;
  const unsent: PendingRequest[] = [];
  const sent = new Map<string, PendingRequest>();
  const pulledListeners = new Set<() => void>();

  function receive(port: CorePort, data: unknown): void {
    if (port !== current) {
      return;
    }
    const answer = coreToRendererMessageSchema.safeParse(data);
    if (!answer.success) {
      return;
    }
    if (answer.data.type === "pulled") {
      for (const listener of pulledListeners) {
        listener();
      }
      return;
    }
    if (sent.get(answer.data.request_id)?.settle(answer.data)) {
      sent.delete(answer.data.request_id);
    }
  }

  function send(port: CorePort, request: PendingRequest): void {
    sent.set(request.message.request_id, request);
    port.postMessage(request.message);
  }

  function ask<T>(message: CoreRequest, read: (answer: CoreAnswer) => T | undefined): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request: PendingRequest = {
        message,
        settle(answer) {
          try {
            const value = read(answer);
            if (value === undefined) {
              return false;
            }
            resolve(value);
          } catch (error) {
            reject(error);
          }
          return true;
        },
        fail: reject,
      };
      if (current === undefined) {
        unsent.push(request);
      } else {
        send(current, request);
      }
    });
  }

  return {
    // A reloaded page or a restarted core hands over a fresh port, and the core behind the one it
    // replaces will never answer what was already sent on it.
    connect(port) {
      current?.close();
      for (const request of sent.values()) {
        request.fail(new Error("the core connection was replaced"));
      }
      sent.clear();
      current = port;
      port.addEventListener("message", (event) => receive(port, event.data));
      port.start();
      for (const request of unsent.splice(0)) {
        send(port, request);
      }
    },
    enrollmentStatus() {
      return ask(
        { type: "enrollment-status-request", request_id: deps.newRequestId() },
        (answer) => (answer.type === "enrollment-status" ? answer.enrolled : undefined),
      );
    },
    registerName() {
      return ask({ type: "register-name-request", request_id: deps.newRequestId() }, (answer) =>
        answer.type === "register-name" ? answer.name : undefined,
      );
    },
    enroll(typedCode) {
      return ask({ type: "enroll", request_id: deps.newRequestId(), code: typedCode }, (answer) =>
        answer.type === "enrollment-result" ? answer.outcome : undefined,
      );
    },
    redeemPinCode(typedCode, newPin) {
      return ask(
        {
          type: "redeem-pin-code",
          request_id: deps.newRequestId(),
          reset_code: typedCode,
          new_pin: newPin,
        },
        (answer) => (answer.type === "pin-code-redemption-result" ? answer.outcome : undefined),
      );
    },
    signInUsers() {
      return ask({ type: "sign-in-users", request_id: deps.newRequestId() }, (answer) => {
        if (answer.type === "sign-in-users-unavailable") {
          throw new Error("the core could not read the users who can sign in");
        }
        return answer.type === "sign-in-users" ? answer.users : undefined;
      });
    },
    authorizers(permission) {
      return ask({ type: "authorizers", request_id: deps.newRequestId(), permission }, (answer) => {
        if (answer.type === "authorizers-unavailable") {
          throw new Error("the core could not read the people who can authorize");
        }
        return answer.type === "authorizers" ? answer.users : undefined;
      });
    },
    signIn(userId, pin) {
      return ask(
        { type: "sign-in", request_id: deps.newRequestId(), user_id: userId, pin },
        (answer) => (answer.type === "sign-in-result" ? answer.outcome : undefined),
      );
    },
    signOut() {
      return ask({ type: "sign-out", request_id: deps.newRequestId() }, (answer) =>
        answer.type === "signed-out" ? true : undefined,
      ).then(() => {});
    },
    openCashSession(openingFloat) {
      return ask(
        { type: "open-cash-session", request_id: deps.newRequestId(), opening_float: openingFloat },
        (answer) => (answer.type === "open-cash-session-result" ? answer.outcome : undefined),
      );
    },
    cashSession() {
      return ask(
        { type: "cash-session-request", request_id: deps.newRequestId() },
        (answer): OpenCashSession | null | "unavailable" | undefined => {
          if (answer.type === "cash-session-unavailable") {
            return "unavailable";
          }
          return answer.type === "cash-session" ? answer.session : undefined;
        },
      );
    },
    onPulled(listener) {
      pulledListeners.add(listener);
      return () => {
        pulledListeners.delete(listener);
      };
    },
  };
}
