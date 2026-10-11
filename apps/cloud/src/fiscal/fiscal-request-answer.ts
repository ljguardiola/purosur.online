import type { RealTimeAuthorizationAnswer } from "@purosur/domain/fiscal/use-cases";
import type { fiscalRequests } from "../platform/db/schema.js";

export type RecordedAnswerColumns = Pick<
  typeof fiscalRequests.$inferSelect,
  | "answerKind"
  | "authorizationCode"
  | "authorizationCodeDueOn"
  | "rejectionCodes"
  | "rejectionClass"
>;

export function answerOf(row: RecordedAnswerColumns): RealTimeAuthorizationAnswer | null {
  switch (row.answerKind) {
    case "authorized":
      return {
        kind: "authorized",
        authorizationCode: row.authorizationCode ?? "",
        authorizationCodeDueOn: row.authorizationCodeDueOn ?? "",
      };
    case "rejected":
      return {
        kind: "rejected",
        codes: row.rejectionCodes ?? [],
        rejectionClass: row.rejectionClass === "standing" ? "standing" : "content",
      };
    case "not_attempted":
      return { kind: "not_attempted" };
    case "unclear":
      return { kind: "unclear" };
    default:
      return null;
  }
}

export function answerColumnsOf(answer: RealTimeAuthorizationAnswer) {
  switch (answer.kind) {
    case "authorized":
      return {
        answerKind: answer.kind,
        authorizationCode: answer.authorizationCode,
        authorizationCodeDueOn: answer.authorizationCodeDueOn,
        rejectionCodes: null,
        rejectionClass: null,
      };
    case "rejected":
      return {
        answerKind: answer.kind,
        authorizationCode: null,
        authorizationCodeDueOn: null,
        rejectionCodes: [...answer.codes],
        rejectionClass: answer.rejectionClass,
      };
    case "not_attempted":
    case "unclear":
      return {
        answerKind: answer.kind,
        authorizationCode: null,
        authorizationCodeDueOn: null,
        rejectionCodes: null,
        rejectionClass: null,
      };
  }
}
