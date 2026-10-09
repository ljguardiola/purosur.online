import type { Clock } from "../../shared/index.js";
import type { PaymentTransactionState } from "../model/payment-transaction.js";

export interface PendingMercadoPagoQrPayment {
  actorId: string;
  saleId: string;
  amount: number;
  occurredAt: Date;
  waitEndsAt: Date;
}

export interface PendingMercadoPagoQrCharge {
  paymentTransactionId: string;
  saleId: string;
  amount: number;
  waitEndsAt: Date;
}

export type EndedMercadoPagoQrChargeState = Exclude<
  PaymentTransactionState,
  "PENDING" | "APPROVED"
>;

export interface MercadoPagoQrChargeSale<Refusal, Settlement> {
  recordPendingPayment(
    payment: PendingMercadoPagoQrPayment,
  ): { kind: "recorded"; paymentTransactionId: string } | { kind: "refused"; refusal: Refusal };
  settleApprovedPayment(payment: { actorId: string; paymentTransactionId: string }): Settlement;
}

export type MercadoPagoQrChargeOrderAnswer =
  | { kind: "created" }
  | { kind: "refused" }
  | { kind: "unreachable" };

export type MercadoPagoQrChargeOrderReading =
  | { kind: "read"; state: PaymentTransactionState }
  | { kind: "unreachable" };

export interface MercadoPagoQrChargeOrders {
  requestOrder(order: {
    paymentTransactionId: string;
    saleId: string;
    amount: number;
  }): Promise<MercadoPagoQrChargeOrderAnswer>;
  readOrder(paymentTransactionId: string): Promise<MercadoPagoQrChargeOrderReading>;
}

export interface MercadoPagoQrCharges {
  pendingCharge(paymentTransactionId: string): PendingMercadoPagoQrCharge | null;
  recordEnded(paymentTransactionId: string, state: EndedMercadoPagoQrChargeState): void;
}

export interface MercadoPagoQrChargePorts<Refusal, Settlement> {
  sale: MercadoPagoQrChargeSale<Refusal, Settlement>;
  orders: MercadoPagoQrChargeOrders;
  charges: MercadoPagoQrCharges;
  clock: Clock;
}
