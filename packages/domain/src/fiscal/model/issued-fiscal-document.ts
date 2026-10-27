import type { RealTimeAuthorizationAnswer } from "./real-time-authorization.js";
import { UNCLEAR_ANSWER_KINDS, type UnclearOutcomeDecision } from "./unclear-outcome-decision.js";

export const ISSUED_FISCAL_DOCUMENTS_PAGE_SIZE = 50;

export const ISSUED_DOCUMENT_KINDS = ["receipt", "credit_note"] as const;
export type IssuedDocumentKind = (typeof ISSUED_DOCUMENT_KINDS)[number];

export const ISSUED_DOCUMENT_STATES = ["authorized", "awaiting_authorization"] as const;
export type IssuedDocumentState = (typeof ISSUED_DOCUMENT_STATES)[number];

export interface OnlineDocumentAuthorizationFacts {
  answer: RealTimeAuthorizationAnswer["kind"] | null;
  decision: UnclearOutcomeDecision["kind"] | null;
}

type ListedOnlineDocumentState = OnlineDocumentAuthorizationFacts & {
  state: IssuedDocumentState;
};

export const LISTED_ONLINE_DOCUMENT_STATES: readonly ListedOnlineDocumentState[] = [
  { answer: "authorized", decision: null, state: "authorized" },
  ...UNCLEAR_ANSWER_KINDS.map(
    (answer): ListedOnlineDocumentState => ({ answer, decision: "adopted", state: "authorized" }),
  ),
  { answer: null, decision: null, state: "awaiting_authorization" },
  ...UNCLEAR_ANSWER_KINDS.map(
    (answer): ListedOnlineDocumentState => ({
      answer,
      decision: null,
      state: "awaiting_authorization",
    }),
  ),
];

export function issuedStateOfOnlineDocument({
  answer,
  decision,
}: OnlineDocumentAuthorizationFacts): IssuedDocumentState | null {
  return (
    LISTED_ONLINE_DOCUMENT_STATES.find(
      (listed) => listed.answer === answer && listed.decision === decision,
    )?.state ?? null
  );
}
