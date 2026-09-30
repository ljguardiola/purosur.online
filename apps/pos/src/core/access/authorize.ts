import type { Authorization, AuthorizationRefusal, AuthorizedBy } from "@purosur/contracts";
import { type AuthorizablePermissionKey, holdsPermission } from "@purosur/domain";
import { checkPin, type PinCheckDeps } from "./pin-check";

export type AuthorizeOutcome = { kind: "authorized"; by: AuthorizedBy } | AuthorizationRefusal;

export async function authorize(
  deps: PinCheckDeps,
  authorization: Authorization,
  permission: AuthorizablePermissionKey,
): Promise<AuthorizeOutcome> {
  const check = await checkPin(deps, authorization.user_id, authorization.pin);
  if (check.kind !== "right_pin") {
    return check;
  }
  if (!holdsPermission(check.record.access, permission)) {
    return { kind: "lacks_permission" };
  }
  return {
    kind: "authorized",
    by: { user_id: authorization.user_id, first_name: check.record.firstName },
  };
}
