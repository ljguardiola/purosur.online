import type { ReceiptContent } from "../../sales/index.js";
import { lineRefundAmount, type ReturnedLineStanding } from "./return-line.js";

export function returnedReceiptLine(
  sold: ReceiptContent["lines"][number],
  returned: { returnedBefore: number; quantity: number; refundedAmount: number },
): ReceiptContent["lines"][number] {
  const beforeDiscounts: ReturnedLineStanding = {
    soldQuantity: sold.quantity,
    chargedAmount: sold.lineTotal + sold.discountAmount,
    returnedQuantity: 0,
    refundedAmount: 0,
  };
  const charged = lineRefundAmount(
    {
      ...beforeDiscounts,
      returnedQuantity: returned.returnedBefore,
      refundedAmount: lineRefundAmount(beforeDiscounts, returned.returnedBefore),
    },
    returned.quantity,
  );
  return {
    ...sold,
    quantity: returned.quantity,
    discountAmount: Math.max(0, charged - returned.refundedAmount),
    lineTotal: returned.refundedAmount,
  };
}
