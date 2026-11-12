import { APPROVED_PAYMENT_STATE, type PaymentMethod, type PointCardType } from "./payment.js";

export interface SaleBalance {
  paid: number;
  pending: number;
}

export interface ApprovedPayment {
  method: PaymentMethod;
  cardType: PointCardType | null;
  amount: number;
}

function isApproved(payment: { state: string }): boolean {
  return payment.state === APPROVED_PAYMENT_STATE;
}

export function approvedPayments(
  payments: readonly {
    method: PaymentMethod;
    cardType?: PointCardType | null;
    amount: number;
    state: string;
  }[],
): ApprovedPayment[] {
  return payments.filter(isApproved).map(({ method, cardType, amount }) => ({
    method,
    cardType: cardType ?? null,
    amount,
  }));
}

export function saleBalance(
  total: number,
  payments: readonly { amount: number; state: string }[],
): SaleBalance {
  const paid = payments.filter(isApproved).reduce((sum, payment) => sum + payment.amount, 0);
  return { paid, pending: total - paid };
}

export function approvedPaymentsCoverTotal(sale: {
  total: number;
  payments: readonly { amount: number; state: string }[];
}): boolean {
  return saleBalance(sale.total, sale.payments).pending <= 0;
}
