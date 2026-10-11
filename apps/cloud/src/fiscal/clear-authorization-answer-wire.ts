import type { RealTimeAuthorizationResponseBody } from "@purosur/contracts";
import type { ClearAuthorizationAnswer } from "@purosur/domain/fiscal/use-cases";

export type ClearAuthorizationAnswerBody = Extract<
  RealTimeAuthorizationResponseBody,
  { state: "AUTHORIZED" | "REJECTED" }
>;

export function clearAuthorizationAnswerToWire(
  answer: ClearAuthorizationAnswer,
): ClearAuthorizationAnswerBody {
  switch (answer.kind) {
    case "authorized":
      return {
        state: "AUTHORIZED",
        authorization_code: answer.authorizationCode,
        authorization_code_due_on: answer.authorizationCodeDueOn,
      };
    case "rejected":
      return {
        state: "REJECTED",
        rejection_codes: [...answer.codes],
        rejection_class: answer.rejectionClass,
      };
  }
}
