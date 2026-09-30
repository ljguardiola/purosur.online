import type { Authorization, AuthorizationRefusal, AuthorizedBy } from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { authorize } from "./authorize";
import type { PinCheckDeps } from "./pin-check";

export interface GuardedAction {
  permission: AuthorizablePermissionKey;
  authorization: Authorization | undefined;
}

export type GuardedOutcome<Result> =
  | { kind: "performed"; authorized_by: AuthorizedBy | null; result: Result }
  | AuthorizationRefusal;

export async function runGuarded<Result>(
  deps: PinCheckDeps,
  action: GuardedAction,
  perform: (authorizedBy: AuthorizedBy | null) => Promise<Result>,
): Promise<GuardedOutcome<Result>> {
  if (action.authorization === undefined) {
    return { kind: "performed", authorized_by: null, result: await perform(null) };
  }
  const outcome = await authorize(deps, action.authorization, action.permission);
  if (outcome.kind !== "authorized") {
    return outcome;
  }
  return { kind: "performed", authorized_by: outcome.by, result: await perform(outcome.by) };
}
