import type {
  AuthorizationRefusal,
  AuthorizedBy,
  OpenCashSession,
  PinAttemptRefusal,
  SignInOutcome,
} from "@purosur/contracts";
import type {
  AuthorizeRegisterOperationOutcome,
  PinRefusal,
  SignInAtRegisterOutcome,
} from "@purosur/domain/access/use-cases";

export type AuthorizeOutcome = { kind: "authorized"; by: AuthorizedBy } | AuthorizationRefusal;

function pinRefusalAnswer(refusal: PinRefusal): PinAttemptRefusal {
  switch (refusal.kind) {
    case "locked":
      return { kind: "locked", consecutive_failures: refusal.consecutiveFailures };
    case "rate_limited":
    case "wrong_pin":
      return {
        kind: refusal.kind,
        retry_after_seconds: refusal.retryAfterSeconds,
        attempts_left: refusal.attemptsLeft,
      };
  }
}

export function signInAnswer(
  outcome: SignInAtRegisterOutcome<OpenCashSession | null>,
): SignInOutcome {
  switch (outcome.kind) {
    case "signed_in":
      return {
        kind: "signed_in",
        person: {
          user_id: outcome.person.userId,
          first_name: outcome.person.firstName,
          abilities: outcome.person.abilities,
        },
        cash_session: outcome.resumedSession,
      };
    case "no_register_permission":
    case "cash_session_opened_by_another":
    case "unavailable":
      return outcome;
    case "locked":
    case "rate_limited":
    case "wrong_pin":
      return pinRefusalAnswer(outcome);
  }
}

export function authorizationAnswer(outcome: AuthorizeRegisterOperationOutcome): AuthorizeOutcome {
  switch (outcome.kind) {
    case "authorized":
      return {
        kind: "authorized",
        by: { user_id: outcome.by.userId, first_name: outcome.by.firstName },
      };
    case "lacks_permission":
    case "unavailable":
      return outcome;
    case "locked":
    case "rate_limited":
    case "wrong_pin":
      return pinRefusalAnswer(outcome);
  }
}
