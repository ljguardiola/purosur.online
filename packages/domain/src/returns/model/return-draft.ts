import {
  lineRefundAmount,
  mustBeReturnedWhole,
  type ReturnedLineStanding,
  returnableQuantity,
} from "./return-line.js";
import type { ReturnDisposition, ReturnReason } from "./return-reasons.js";
import { isReturnWindowOpen, returnWindowLastDay } from "./return-window.js";

export interface ReturnSaleLine extends ReturnedLineStanding {
  id: string;
  promotionId: string | null;
}

export interface ReturnSaleContext {
  soldAt: Date;
  goodConditionReturnDays: number;
  now: Date;
  lines: readonly ReturnSaleLine[];
}

export interface ReturnDraftLine {
  saleLineId: string;
  quantity: number;
  reason: ReturnReason | null;
  disposition: ReturnDisposition | null;
}

export type ReturnLineRefusal =
  | { kind: "unknown_line" }
  | { kind: "duplicate_line" }
  | { kind: "invalid_quantity" }
  | { kind: "missing_reason" }
  | { kind: "missing_disposition" }
  | { kind: "quantity_exceeds_returnable"; returnable: number }
  | { kind: "promotion_whole_only"; returnable: number }
  | { kind: "outside_window"; reason: ReturnReason; lastAllowedDay: string };

type AcceptedVerdict = {
  refusal: null;
  refundAmount: number;
  reason: ReturnReason;
  disposition: ReturnDisposition;
};

type LineVerdict = AcceptedVerdict | { refusal: ReturnLineRefusal; refundAmount: null };

export type ReturnLineAssessment = ReturnDraftLine & LineVerdict;

export type AcceptedReturnLine = ReturnDraftLine & AcceptedVerdict;

function refused(refusal: ReturnLineRefusal): LineVerdict {
  return { refusal, refundAmount: null };
}

function verdictOf(
  context: ReturnSaleContext,
  line: ReturnSaleLine | undefined,
  draft: ReturnDraftLine,
  repeated: boolean,
): LineVerdict {
  if (line === undefined) {
    return refused({ kind: "unknown_line" });
  }
  if (repeated) {
    return refused({ kind: "duplicate_line" });
  }
  if (!Number.isSafeInteger(draft.quantity) || draft.quantity <= 0) {
    return refused({ kind: "invalid_quantity" });
  }
  if (draft.reason === null) {
    return refused({ kind: "missing_reason" });
  }
  if (draft.disposition === null) {
    return refused({ kind: "missing_disposition" });
  }
  const returnable = returnableQuantity(line);
  if (draft.quantity > returnable) {
    return refused({ kind: "quantity_exceeds_returnable", returnable });
  }
  if (mustBeReturnedWhole(line) && draft.quantity !== returnable) {
    return refused({ kind: "promotion_whole_only", returnable });
  }
  const lastAllowedDay = returnWindowLastDay(
    draft.reason,
    context.soldAt,
    context.goodConditionReturnDays,
  );
  if (!isReturnWindowOpen(lastAllowedDay, context.now)) {
    return refused({ kind: "outside_window", reason: draft.reason, lastAllowedDay });
  }
  return {
    refusal: null,
    refundAmount: lineRefundAmount(line, draft.quantity),
    reason: draft.reason,
    disposition: draft.disposition,
  };
}

export function assessReturnDraft(
  context: ReturnSaleContext,
  draft: readonly ReturnDraftLine[],
): ReturnLineAssessment[] {
  return draft.map((line, position) => {
    const saleLine = context.lines.find(({ id }) => id === line.saleLineId);
    const repeated = draft
      .slice(0, position)
      .some(({ saleLineId }) => saleLineId === line.saleLineId);
    return { ...line, ...verdictOf(context, saleLine, line, repeated) };
  });
}

export function firstLineRefusal(
  assessments: readonly ReturnLineAssessment[],
): { saleLineId: string; refusal: ReturnLineRefusal } | null {
  for (const { saleLineId, refusal } of assessments) {
    if (refusal !== null) {
      return { saleLineId, refusal };
    }
  }
  return null;
}

export function acceptedLines(assessments: readonly ReturnLineAssessment[]): AcceptedReturnLine[] {
  return assessments.filter((line): line is AcceptedReturnLine => line.refusal === null);
}

export function refundableTotal(assessments: readonly ReturnLineAssessment[]): number {
  return assessments.reduce((total, { refundAmount }) => total + (refundAmount ?? 0), 0);
}
