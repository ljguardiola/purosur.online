import type { Authorization, AuthorizedBy, GuardedActionRefusal } from "@purosur/contracts";
import {
  type AuthorizablePermissionKey,
  holdsPermission,
  isAuthorizablePermissionKey,
  type PermissionKey,
} from "@purosur/domain";
import { authorize } from "./authorize";
import type { PinCheckDeps } from "./pin-check";
import type { SignedInPerson } from "./signed-in-person";
import type { SignInStore } from "./sqlite-sign-in-store";

export type GuardedAction =
  | { permission: AuthorizablePermissionKey; authorization?: Authorization | undefined }
  | { permission: Exclude<PermissionKey, AuthorizablePermissionKey>; authorization?: undefined };

export type GuardedOutcome<Result> =
  | { kind: "performed"; authorized_by: AuthorizedBy | null; result: Result }
  | GuardedActionRefusal;

export interface ActionGateDeps extends PinCheckDeps {
  store: PinCheckDeps["store"] & Pick<SignInStore, "roleAccess">;
  signedInPerson: Pick<SignedInPerson, "userId">;
}

export interface GuardedActor {
  signedInUserId: string;
  authorizedBy: AuthorizedBy | null;
}

export interface ActionGate {
  run<Result>(
    action: GuardedAction,
    perform: (actor: GuardedActor) => Promise<Result>,
  ): Promise<GuardedOutcome<Result>>;
}

export function createActionGate(deps: ActionGateDeps): ActionGate {
  return {
    async run(action, perform) {
      const signedInUserId = deps.signedInPerson.userId();
      const access =
        signedInUserId === undefined ? undefined : deps.store.roleAccess(signedInUserId);
      if (signedInUserId === undefined || access === undefined) {
        return { kind: "not_signed_in" };
      }
      if (action.authorization === undefined) {
        if (!holdsPermission(access, action.permission)) {
          return { kind: "lacks_permission" };
        }
        return {
          kind: "performed",
          authorized_by: null,
          result: await perform({ signedInUserId, authorizedBy: null }),
        };
      }
      if (!isAuthorizablePermissionKey(action.permission)) {
        return { kind: "lacks_permission" };
      }
      const outcome = await authorize(deps, action.authorization, action.permission);
      if (outcome.kind !== "authorized") {
        return outcome;
      }
      if (deps.signedInPerson.userId() !== signedInUserId) {
        return { kind: "not_signed_in" };
      }
      return {
        kind: "performed",
        authorized_by: outcome.by,
        result: await perform({ signedInUserId, authorizedBy: outcome.by }),
      };
    },
  };
}
