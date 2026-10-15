import { compareSpanishText } from "../../shared/index.js";
import { CONFIRMED_BY_HAND_METHODS, type ConfirmedByHandMethod } from "./payment.js";

export interface HandConfirmedPayment {
  id: string;
  method: ConfirmedByHandMethod;
  amount: number;
  confirmedAt: Date;
  cashierId: string;
  cashierName: string | null;
  confirmedById: string;
  confirmedByName: string | null;
  saleOperationNumber: number | null;
}

export interface HandConfirmedMethodTotal {
  method: ConfirmedByHandMethod;
  count: number;
  amount: number;
}

export interface HandConfirmedCashierTotal {
  cashierId: string;
  cashierName: string | null;
  count: number;
  amount: number;
  methods: HandConfirmedMethodTotal[];
}

export interface HandConfirmedPaymentsReconciliation {
  totals: { count: number; amount: number };
  methods: HandConfirmedMethodTotal[];
  cashiers: HandConfirmedCashierTotal[];
  payments: HandConfirmedPayment[];
}

function totalsByMethod(payments: readonly HandConfirmedPayment[]): HandConfirmedMethodTotal[] {
  return CONFIRMED_BY_HAND_METHODS.map((method) => {
    const ofMethod = payments.filter((payment) => payment.method === method);
    return {
      method,
      count: ofMethod.length,
      amount: ofMethod.reduce((sum, payment) => sum + payment.amount, 0),
    };
  });
}

function compareNames(a: string | null, b: string | null): number {
  if (a === null) {
    return b === null ? 0 : 1;
  }
  if (b === null) {
    return -1;
  }
  return compareSpanishText(a, b);
}

function compareCashiers(a: HandConfirmedCashierTotal, b: HandConfirmedCashierTotal): number {
  return (
    b.amount - a.amount ||
    compareNames(a.cashierName, b.cashierName) ||
    compareSpanishText(a.cashierId, b.cashierId)
  );
}

function totalsByCashier(payments: readonly HandConfirmedPayment[]): HandConfirmedCashierTotal[] {
  const byCashier = new Map<string, HandConfirmedPayment[]>();
  for (const payment of payments) {
    byCashier.set(payment.cashierId, [...(byCashier.get(payment.cashierId) ?? []), payment]);
  }
  return [...byCashier.entries()]
    .map(([cashierId, ofCashier]) => ({
      cashierId,
      cashierName: ofCashier[0]?.cashierName ?? null,
      count: ofCashier.length,
      amount: ofCashier.reduce((sum, payment) => sum + payment.amount, 0),
      methods: totalsByMethod(ofCashier),
    }))
    .sort(compareCashiers);
}

export function reconcileHandConfirmedPayments(
  payments: readonly HandConfirmedPayment[],
): HandConfirmedPaymentsReconciliation {
  return {
    totals: {
      count: payments.length,
      amount: payments.reduce((sum, payment) => sum + payment.amount, 0),
    },
    methods: totalsByMethod(payments),
    cashiers: totalsByCashier(payments),
    payments: [...payments].sort((a, b) => b.confirmedAt.getTime() - a.confirmedAt.getTime()),
  };
}
