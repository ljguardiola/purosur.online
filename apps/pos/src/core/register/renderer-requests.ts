import type {
  CoreToRendererMessage,
  EnrollmentOutcome,
  RendererToCoreMessage,
  SignInOutcome,
  SignInUser,
} from "@purosur/contracts";

export interface RendererRequestDeps {
  credentialsPresent: () => Promise<boolean>;
  enroll: (typedCode: string) => Promise<EnrollmentOutcome>;
  signInUsers: (() => SignInUser[]) | undefined;
  signIn: ((userId: string, pin: string) => Promise<SignInOutcome>) | undefined;
}

function readSignInUsers(deps: RendererRequestDeps): SignInUser[] | undefined {
  try {
    return deps.signInUsers?.();
  } catch {
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
  } catch {
    return { kind: "unavailable" };
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
    case "enroll":
      return {
        type: "enrollment-result",
        request_id: message.request_id,
        outcome: await deps.enroll(message.code),
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
    case "ping":
      return undefined;
  }
}
