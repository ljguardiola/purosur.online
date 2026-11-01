import type { DiscountBenefit } from "../../pricing/index.js";
import { roundHalfUp } from "../../shared/index.js";
import { RETURN_REASONS, type ReturnReason } from "./return-reasons.js";

export interface ReturnedLineStanding {
  soldQuantity: number;
  returnedQuantity: number;
  chargedAmount: number;
  refundedAmount: number;
}

export function returnableQuantity({
  soldQuantity,
  returnedQuantity,
}: Pick<ReturnedLineStanding, "soldQuantity" | "returnedQuantity">): number {
  return Math.max(0, soldQuantity - returnedQuantity);
}

export function wholeOnlyReasons({
  promotionId,
  promotionKind,
}: {
  promotionId: string | null;
  promotionKind: DiscountBenefit["kind"] | null;
}): readonly ReturnReason[] {
  if (promotionId === null) {
    return [];
  }
  switch (promotionKind) {
    case "PERCENT_OFF":
      return [];
    case "BUY_N_PAY_M":
      return ["change_of_mind"];
    case null:
      return RETURN_REASONS;
  }
}

export function lineRefundAmount(line: ReturnedLineStanding, quantity: number): number {
  const returnedAfter = line.returnedQuantity + quantity;
  return (
    roundHalfUp({
      numerator: BigInt(line.chargedAmount) * BigInt(returnedAfter),
      denominator: BigInt(line.soldQuantity),
    }) - line.refundedAmount
  );
}
