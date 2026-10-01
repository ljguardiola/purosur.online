import type { Authorization, AuthorizationRefusal, AuthorizedBy } from "@purosur/contracts";
import { type RegisterOperation, registerOperationAccess } from "@purosur/domain";
import { authorize } from "./authorize";
import type { PinCheckDeps } from "./pin-matching";
import type { SignedInPerson } from "./signed-in-person";
import type { SignInStore } from "./sqlite-sign-in-store";

type OperationOf<Kind extends RegisterOperation["kind"]> = Extract<
  RegisterOperation,
  { kind: Kind }
>;

type SignedInOperation = OperationOf<"open_cash_session" | "sell" | "close_cash_session">;
type CashMovementOperation = OperationOf<"record_cash_movement">;
type LockedRegisterOperation = OperationOf<"close_locked_register">;

type SignedInRefusal = { kind: "not_signed_in" } | { kind: "lacks_permission" };

type SignedInOutcome<Result> = { kind: "performed"; result: Result } | SignedInRefusal;

type AuthorizedOutcome<Result> =
  | { kind: "performed"; authorized_by: AuthorizedBy | null; result: Result }
  | SignedInRefusal
  | AuthorizationRefusal;

type LockedOutcome<Result> =
  | { kind: "performed"; result: Result }
  | AuthorizationRefusal
  | { kind: "not_locked" };

export interface ActionGateDeps extends PinCheckDeps {
  store: PinCheckDeps["store"] & Pick<SignInStore, "activePerson">;
  signedInPerson: Pick<SignedInPerson, "userId">;
}

export interface SignedInActor {
  signedInUserId: string;
}

export interface AuthorizedActor extends SignedInActor {
  authorizedBy: AuthorizedBy | null;
}

export interface ActionGate {
  run<Result>(
    operation: SignedInOperation,
    perform: (actor: SignedInActor) => Promise<Result>,
  ): Promise<SignedInOutcome<Result>>;
  runAuthorized<Result>(
    operation: CashMovementOperation,
    authorization: Authorization | undefined,
    perform: (actor: AuthorizedActor) => Promise<Result>,
  ): Promise<AuthorizedOutcome<Result>>;
  runWhileLocked<Result>(
    operation: LockedRegisterOperation,
    authorization: Authorization,
    perform: (person: AuthorizedBy) => Promise<Result>,
  ): Promise<LockedOutcome<Result>>;
}

export function createActionGate(deps: ActionGateDeps): ActionGate {
  function answerFor(operation: RegisterOperation) {
    const signedInUserId = deps.signedInPerson.userId();
    if (signedInUserId === undefined) {
      return { kind: "not_signed_in" } as const;
    }
    const access = deps.store.activePerson(signedInUserId)?.access;
    const answer = registerOperationAccess(operation, { id: signedInUserId, access });
    if (answer.kind === "no_access") {
      return { kind: "not_signed_in" } as const;
    }
    return { kind: "answered", signedInUserId, answer } as const;
  }

  return {
    async run(operation, perform) {
      const answered = answerFor(operation);
      if (answered.kind === "not_signed_in") {
        return answered;
      }
      if (answered.answer.kind !== "permitted") {
        return { kind: "lacks_permission" };
      }
      return {
        kind: "performed",
        result: await perform({ signedInUserId: answered.signedInUserId }),
      };
    },
    async runAuthorized(operation, authorization, perform) {
      const answered = answerFor(operation);
      if (answered.kind === "not_signed_in") {
        return answered;
      }
      const { signedInUserId, answer } = answered;
      if (answer.kind === "permitted") {
        return {
          kind: "performed",
          authorized_by: null,
          result: await perform({ signedInUserId, authorizedBy: null }),
        };
      }
      if (answer.kind === "refused" || authorization === undefined) {
        return { kind: "lacks_permission" };
      }
      const outcome = await authorize(deps, authorization, operation);
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
    async runWhileLocked(operation, authorization, perform) {
      if (deps.signedInPerson.userId() !== undefined) {
        return { kind: "not_locked" };
      }
      if (registerOperationAccess(operation, undefined).kind !== "needs_authorization") {
        return { kind: "lacks_permission" };
      }
      const outcome = await authorize(deps, authorization, operation);
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
