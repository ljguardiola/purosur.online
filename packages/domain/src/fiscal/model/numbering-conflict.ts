import type { RealTimeAuthorizationAnswer } from "./real-time-authorization.js";

const NUMBER_OR_DATE_OUT_OF_ORDER_CODE = 10016;

export const NUMBERING_CONFLICT_REASK_INTERVAL_MS = 30_000;

export function isNumberingConflict(codes: readonly number[]): boolean {
  return codes.includes(NUMBER_OR_DATE_OUT_OF_ORDER_CODE);
}

export interface NumberingConflictAnswer {
  answer: RealTimeAuthorizationAnswer | null;
  unclearCodes: readonly number[];
}

export function isNumberingConflictAnswer({
  answer,
  unclearCodes,
}: NumberingConflictAnswer): boolean {
  return answer?.kind === "unclear" && isNumberingConflict(unclearCodes);
}

export function awaitsNumberingDiagnosis(
  request: NumberingConflictAnswer & { diagnosis: NumberingConflictDiagnosis | null },
): boolean {
  return request.diagnosis === null && isNumberingConflictAnswer(request);
}

export interface NumberingConflictFacts {
  number: number;
  issuedOn: string;
  lastAuthorized: number;
  lastAuthorizedIssuedOn: string | null;
}

export type NumberingConflictDiagnosis = { kind: "date_behind" } | { kind: "collision" };

export function diagnoseNumberingConflict({
  number,
  issuedOn,
  lastAuthorized,
  lastAuthorizedIssuedOn,
}: NumberingConflictFacts): NumberingConflictDiagnosis {
  const onlyDateBehind =
    number === lastAuthorized + 1 &&
    lastAuthorizedIssuedOn !== null &&
    issuedOn < lastAuthorizedIssuedOn;
  return onlyDateBehind ? { kind: "date_behind" } : { kind: "collision" };
}

export interface NumberingFreeze {
  countBeforeFreeze: number;
  frozenAt: Date;
}

export function restorationNumberingFreeze(
  heldCount: number | null,
  at: Date,
): NumberingFreeze | null {
  return heldCount === null ? null : { countBeforeFreeze: heldCount, frozenAt: at };
}

type NumberingDocumentSettlement =
  | "authorized"
  | "conflicting"
  | "released_or_rejected"
  | "undecided";

export interface NumberingReconciliationDocument {
  number: number;
  settlement: NumberingDocumentSettlement;
}

export interface NumberingReconciliationInput {
  countBeforeFreeze: number;
  lastAuthorized: number;
  documents: readonly NumberingReconciliationDocument[];
}

export type NumberingReconciliation =
  | { kind: "waiting" }
  | { kind: "reconciled"; lastAuthorized: number; numbersWithoutOwnDocument: number[] };

export function decideNumberingReconciliation({
  countBeforeFreeze,
  lastAuthorized,
  documents,
}: NumberingReconciliationInput): NumberingReconciliation {
  const inRange = documents.filter(
    ({ number }) => number > countBeforeFreeze && number <= lastAuthorized,
  );
  if (inRange.some(({ settlement }) => settlement === "undecided")) {
    return { kind: "waiting" };
  }
  const accounted = new Set(
    inRange.filter(({ settlement }) => settlement === "authorized").map(({ number }) => number),
  );
  const numbersWithoutOwnDocument: number[] = [];
  for (let number = countBeforeFreeze + 1; number <= lastAuthorized; number += 1) {
    if (!accounted.has(number)) {
      numbersWithoutOwnDocument.push(number);
    }
  }
  return { kind: "reconciled", lastAuthorized, numbersWithoutOwnDocument };
}
