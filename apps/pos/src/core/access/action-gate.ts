import type {
  Authorization,
  AuthorizationRefusal,
  AuthorizedBy,
  GuardedActionRefusal,
} from "@purosur/contracts";
import {
  type AuthorizablePermissionKey,
  holdsPermission,
  isAuthorizablePermissionKey,
  isLockedToAnother,
  type PermissionKey,
} from "@purosur/domain";
import { authorize } from "./authorize";
import type { PinCheckDeps } from "./pin-check";
import type { SignedInPerson } from "./signed-in-person";
import type { SignInStore } from "./sqlite-sign-in-store";

export type GuardedAction =
  | { permission: AuthorizablePermissionKey; authorization?: Authorization | undefined }
  | { permission: Exclude<PermissionKey, AuthorizablePermissionKey>; authorization?: undefined }
  | { closesCashSession: { openedBy: string }; authorization?: undefined };

type GuardedOutcome<Result> =
  | { kind: "performed"; authorized_by: AuthorizedBy | null; result: Result }
  | GuardedActionRefusal;

type LockedOutcome<Result> =
  | { kind: "performed"; result: Result }
  | AuthorizationRefusal
  | { kind: "not_locked" };

export interface ActionGateDeps extends PinCheckDeps {
  store: PinCheckDeps["store"] & Pick<SignInStore, "activePerson">;
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
  runWhileLocked<Result>(
    permission: AuthorizablePermissionKey,
    authorization: Authorization,
    perform: (person: AuthorizedBy) => Promise<Result>,
  ): Promise<LockedOutcome<Result>>;
}

export function createActionGate(deps: ActionGateDeps): ActionGate {
  return {
    async run(action, perform) {
      const signedInUserId = deps.signedInPerson.userId();
      if (signedInUserId === undefined) {
        return { kind: "not_signed_in" };
      }
      if (!("permission" in action)) {
        if (
          action.closesCashSession === undefined ||
          isLockedToAnother(action.closesCashSession, signedInUserId)
        ) {
          return { kind: "lacks_permission" };
        }
        return {
          kind: "performed",
          authorized_by: null,
          result: await perform({ signedInUserId, authorizedBy: null }),
        };
      }
      const access = deps.store.activePerson(signedInUserId)?.access;
      if (access === undefined) {
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
    async runWhileLocked(permission, authorization, perform) {
      if (deps.signedInPerson.userId() !== undefined) {
        return { kind: "not_locked" };
      }
      const outcome = await authorize(deps, authorization, permission);
      if (outcome.kind !== "authorized") {
        return outcome;
      }
      if (deps.signedInPerson.userId() !== undefined) {
        return { kind: "not_locked" };
      }
      return { kind: "performed", result: await perform(outcome.by) };
    },
  };
}
