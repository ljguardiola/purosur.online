import type { Clock } from "../../shared/index.js";
import type { PointCardType } from "../model/payment.js";
import type {
  MercadoPagoPaymentTransaction,
  PaymentTransactionState,
} from "../model/payment-transaction.js";

export type MercadoPagoChargeMethod =
  | { method: "QR"; cardType?: never }
  | { method: "POINT"; cardType: PointCardType };

export type PendingMercadoPagoPayment = {
  actorId: string;
  saleId: string;
  amount: number;
  occurredAt: Date;
  waitEndsAt: Date;
} & MercadoPagoChargeMethod;

export interface PendingMercadoPagoCharge {
  paymentTransactionId: string;
  saleId: string;
  method: MercadoPagoPaymentTransaction["method"];
  amount: number;
  waitEndsAt: Date;
}

export interface InterruptedMercadoPagoCharge {
  paymentTransactionId: string;
  actorId: string;
}

export type EndedMercadoPagoChargeState = Exclude<PaymentTransactionState, "PENDING" | "APPROVED">;

export interface MercadoPagoChargeSale<Refusal, Settlement, ReplacementRefusal = unknown> {
  recordPendingPayment(
    payment: PendingMercadoPagoPayment,
  ): { kind: "recorded"; paymentTransactionId: string } | { kind: "refused"; refusal: Refusal };
  settleApprovedPayment(payment: { actorId: string; paymentTransactionId: string }): Settlement;
  replacePendingPayment(payment: {
    actorId: string;
    paymentTransactionId: string;
    replacedAt: Date;
  }): { kind: "replaced" } | { kind: "refused"; refusal: ReplacementRefusal };
}

export type MercadoPagoChargeOrderAnswer =
  | { kind: "created"; expiresAt: Date }
  | { kind: "refused" }
  | { kind: "not_configured" }
  | { kind: "below_minimum" }
  | { kind: "unreachable" };

export type MercadoPagoChargeOrderReading =
  | { kind: "read"; state: PaymentTransactionState }
  | { kind: "not_recorded" }
  | { kind: "unreachable" };

export type MercadoPagoChargeOrderCancellation =
  | { kind: "answered"; state: PaymentTransactionState }
  | { kind: "cancel_on_terminal" }
  | { kind: "unreachable" };

export interface MercadoPagoChargeOrder {
  paymentTransactionId: string;
  saleId: string;
  method: MercadoPagoPaymentTransaction["method"];
  amount: number;
}

export type MercadoPagoChargeOrderRequest = {
  paymentTransactionId: string;
  saleId: string;
  amount: number;
} & MercadoPagoChargeMethod;

export interface MercadoPagoChargeOrders {
  requestOrder(order: MercadoPagoChargeOrderRequest): Promise<MercadoPagoChargeOrderAnswer>;
  readOrder(paymentTransactionId: string): Promise<MercadoPagoChargeOrderReading>;
  cancelOrder(order: MercadoPagoChargeOrder): Promise<MercadoPagoChargeOrderCancellation>;
}

export interface MercadoPagoCharges {
  pendingCharge(paymentTransactionId: string): PendingMercadoPagoCharge | null;
  pendingCharges(): InterruptedMercadoPagoCharge[];
  recordEnded(paymentTransactionId: string, state: EndedMercadoPagoChargeState): void;
  recordWaitEnd(paymentTransactionId: string, waitEndsAt: Date): void;
}

export interface MercadoPagoChargePorts<Refusal, Settlement, ReplacementRefusal = unknown> {
  sale: MercadoPagoChargeSale<Refusal, Settlement, ReplacementRefusal>;
  orders: MercadoPagoChargeOrders;
  charges: MercadoPagoCharges;
  clock: Clock;
}
