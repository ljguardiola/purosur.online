import type { Authorization, AuthorizationRefusal, AuthorizedBy } from "@purosur/contracts";
import { mayAuthorize, pinSignInAttemptsLeft, type RegisterOperation } from "@purosur/domain";
import { checkCountedPin, type PinCheckDeps, signableRecord } from "./pin-check";

export type AuthorizeOutcome = { kind: "authorized"; by: AuthorizedBy } | AuthorizationRefusal;

export async function authorize(
  deps: PinCheckDeps,
  authorization: Authorization,
  operation: RegisterOperation,
): Promise<AuthorizeOutcome> {
  const signable = signableRecord(deps.store, authorization.user_id);
  if (signable === undefined) {
    return { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: pinSignInAttemptsLeft(1) };
  }
  const authorizer = { id: authorization.user_id, access: signable.record.access };
  if (!mayAuthorize(operation, authorizer)) {
    return { kind: "lacks_permission" };
  }
  const check = await checkCountedPin(deps, authorization.user_id, signable, authorization.pin);
  if (check.kind !== "right_pin") {
    return check;
  }
  return {
    kind: "authorized",
    by: { user_id: authorization.user_id, first_name: signable.record.firstName },
  };
}
