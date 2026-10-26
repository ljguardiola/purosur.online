import type { ReturnReason } from "./return-reasons.js";
import { isReturnWindowOpen, returnWindowLastDay } from "./return-window.js";

export type ReturnHistoryBreak =
  | "return_refund_exceeds_payment"
  | "return_line_outside_window"
  | "return_quantity_exceeds_sale";

export interface SaleReturnHistory {
  saleOccurredAt: Date;
  goodConditionReturnDays: number;
  lines: { saleLineId: string; soldQuantity: number; returnedQuantity: number }[];
  payments: { paymentId: string; amount: number; refundedAmount: number }[];
}

export interface ReturnAgainstHistory {
  occurredAt: Date;
  lines: { saleLineId: string; quantity: number; reason: ReturnReason }[];
  refunds: { paymentId: string; amount: number }[];
}

function refundsExceedPayments(
  { refunds }: ReturnAgainstHistory,
  { payments }: SaleReturnHistory,
): boolean {
  const refundedNow = new Map<string, number>();
  for (const { paymentId, amount } of refunds) {
    refundedNow.set(paymentId, (refundedNow.get(paymentId) ?? 0) + amount);
  }
  return [...refundedNow].some(([paymentId, amount]) => {
    const payment = payments.find((candidate) => candidate.paymentId === paymentId);
    return payment === undefined || payment.refundedAmount + amount > payment.amount;
  });
}

function linesOutsideWindow(
  { lines, occurredAt }: ReturnAgainstHistory,
  { saleOccurredAt, goodConditionReturnDays }: SaleReturnHistory,
): boolean {
  return lines.some(
    ({ reason }) =>
      !isReturnWindowOpen(
        returnWindowLastDay(reason, saleOccurredAt, goodConditionReturnDays),
        occurredAt,
      ),
  );
}

function quantitiesExceedSale(
  { lines }: ReturnAgainstHistory,
  history: SaleReturnHistory,
): boolean {
  const returnedNow = new Map<string, number>();
  for (const { saleLineId, quantity } of lines) {
    returnedNow.set(saleLineId, (returnedNow.get(saleLineId) ?? 0) + quantity);
  }
  return [...returnedNow].some(([saleLineId, quantity]) => {
    const line = history.lines.find((candidate) => candidate.saleLineId === saleLineId);
    return line === undefined || line.returnedQuantity + quantity > line.soldQuantity;
  });
}

export function returnHistoryBreaks(
  returned: ReturnAgainstHistory,
  history: SaleReturnHistory,
): ReturnHistoryBreak[] {
  const breaks: ReturnHistoryBreak[] = [];
  if (refundsExceedPayments(returned, history)) {
    breaks.push("return_refund_exceeds_payment");
  }
  if (linesOutsideWindow(returned, history)) {
    breaks.push("return_line_outside_window");
  }
  if (quantitiesExceedSale(returned, history)) {
    breaks.push("return_quantity_exceeds_sale");
  }
  return breaks;
}
