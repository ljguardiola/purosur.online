import { mayAuthorize, type RegisterOperation } from "../../register/index.js";
import { pinSignInAttemptsLeft } from "../model/pin-sign-in-failures.js";
import { checkPin, type PinRefusal } from "./check-pin.js";
import type { PinCheckPorts } from "./pin-sign-in-store.js";

export interface AuthorizeRegisterOperationInput {
  userId: string;
  pin: string;
  operation: RegisterOperation;
}

export type AuthorizeRegisterOperationOutcome =
  | { kind: "authorized"; by: { userId: string; firstName: string } }
  | { kind: "lacks_permission" }
  | PinRefusal
  | { kind: "unavailable" };

export async function authorizeRegisterOperation<Credential>(
  ports: PinCheckPorts<Credential>,
  { userId, pin, operation }: AuthorizeRegisterOperationInput,
): Promise<AuthorizeRegisterOperationOutcome> {
  const holder = ports.store.pinHolder(userId);
  if (holder === undefined) {
    return { kind: "wrong_pin", retryAfterSeconds: 0, attemptsLeft: pinSignInAttemptsLeft(1) };
  }
  if (!mayAuthorize(operation, { id: userId, access: holder.access })) {
    return { kind: "lacks_permission" };
  }
  const check = await checkPin(ports, { userId, credential: holder.credential, pin });
  if (check.kind !== "right_pin") {
    return check;
  }
  return { kind: "authorized", by: { userId, firstName: holder.firstName } };
}
