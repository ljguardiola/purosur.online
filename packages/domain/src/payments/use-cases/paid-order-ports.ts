import type { Clock } from "../../shared/index.js";
import type { LocalStateOfPaidOrder } from "../model/paid-order-discovery.js";
import type { MercadoPagoPaymentTransaction } from "../model/payment-transaction.js";

export interface ApprovedOrderOfRegister {
  paymentTransactionId: string;
  saleId: string;
  method: MercadoPagoPaymentTransaction["method"];
  provider: MercadoPagoPaymentTransaction["provider"];
  amount: number;
  createdAt: Date;
}

export interface ApprovedOrdersOfRegister {
  approvedWithoutSaleSince(registerId: string, since: Date): Promise<ApprovedOrderOfRegister[]>;
}

export type ApprovedOrdersAnswer =
  | { kind: "listed"; orders: ApprovedOrderOfRegister[] }
  | { kind: "unreachable" };

export interface PaidOrdersOfRegister {
  approvedSince(since: Date): Promise<ApprovedOrdersAnswer>;
}

export type LatePaymentRefundRequestAnswer =
  | { kind: "opened" }
  | { kind: "already_open" }
  | { kind: "refused" }
  | { kind: "unreachable" };

export interface LatePaymentRefundRequests {
  openLatePaymentRefund(paymentTransactionId: string): Promise<LatePaymentRefundRequestAnswer>;
}

export interface PaidOrderWithoutSale extends ApprovedOrderOfRegister {
  recordedAt: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface LocalPaidOrders {
  localStateOf(order: ApprovedOrderOfRegister): LocalStateOfPaidOrder;
  actorOfSale(saleId: string): string | undefined;
  inOneTransaction<TOutcome>(work: () => TOutcome): TOutcome;
  holdAsPendingPayment(order: ApprovedOrderOfRegister): void;
  approvePayment(paymentTransactionId: string): void;
  paidOrderWithoutSale(paymentTransactionId: string): PaidOrderWithoutSale | undefined;
  recordPaidOrderWithoutSale(order: ApprovedOrderOfRegister, recordedAt: Date): void;
  resolvePaidOrderWithoutSale(paymentTransactionId: string, resolvedAt: Date): void;
  paidOrdersWithoutSale(): PaidOrderWithoutSale[];
}

export type PaidOrderSettlement =
  | { kind: "completed"; saleId: string }
  | { kind: "partially_paid" }
  | { kind: "refused" };

export interface PaidOrderSale {
  settleApprovedPayment(payment: {
    actorId: string;
    paymentTransactionId: string;
  }): PaidOrderSettlement;
}

export interface PaidOrderDiscoveryPorts {
  cloud: PaidOrdersOfRegister;
  refunds: LatePaymentRefundRequests;
  local: LocalPaidOrders;
  sale: PaidOrderSale;
  clock: Clock;
}
