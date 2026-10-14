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
  approvedUnreplacedSince(registerId: string, since: Date): Promise<ApprovedOrderOfRegister[]>;
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
  applyApprovedPayment(order: ApprovedOrderOfRegister): void;
  paidOrderWithoutSale(paymentTransactionId: string): PaidOrderWithoutSale | undefined;
  recordPaidOrderWithoutSale(order: ApprovedOrderOfRegister, recordedAt: Date): void;
  resolvePaidOrderWithoutSale(paymentTransactionId: string, resolvedAt: Date): void;
  paidOrdersWithoutSale(): PaidOrderWithoutSale[];
}

export interface PaidOrderDiscoveryPorts {
  cloud: PaidOrdersOfRegister;
  refunds: LatePaymentRefundRequests;
  local: LocalPaidOrders;
  clock: Clock;
}
