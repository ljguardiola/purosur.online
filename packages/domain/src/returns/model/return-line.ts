import { roundHalfUp } from "../../shared/index.js";

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

export function mustBeReturnedWhole({ promotionId }: { promotionId: string | null }): boolean {
  return promotionId !== null;
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
