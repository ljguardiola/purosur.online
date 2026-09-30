import type { Authorization, AuthorizationRefusal, AuthorizedBy } from "@purosur/contracts";
import { type AuthorizablePermissionKey, holdsPermission } from "@purosur/domain";
import { checkPin, type PinCheckDeps, signableRecord } from "./pin-check";

export type AuthorizeOutcome = { kind: "authorized"; by: AuthorizedBy } | AuthorizationRefusal;

export async function authorize(
  deps: PinCheckDeps,
  authorization: Authorization,
  permission: AuthorizablePermissionKey,
): Promise<AuthorizeOutcome> {
  const signable = signableRecord(deps.store, authorization.user_id);
  if (signable === undefined) {
    return { kind: "wrong_pin" };
  }
  if (!holdsPermission(signable.record.access, permission)) {
    return { kind: "lacks_permission" };
  }
  const check = await checkPin(deps, signable, authorization.pin);
  if (check.kind !== "right_pin") {
    return check;
  }
  return {
    kind: "authorized",
    by: { user_id: authorization.user_id, first_name: signable.record.firstName },
  };
}
