import type { Clock } from "../../shared/index.js";
import type {
  MercadoPagoPaymentTransaction,
  PaymentTransactionState,
} from "../model/payment-transaction.js";

export interface PendingMercadoPagoPayment {
  actorId: string;
  saleId: string;
  method: MercadoPagoPaymentTransaction["method"];
  amount: number;
  occurredAt: Date;
  waitEndsAt: Date;
}

export interface PendingMercadoPagoCharge {
  paymentTransactionId: string;
  saleId: string;
  method: MercadoPagoPaymentTransaction["method"];
  amount: number;
  waitEndsAt: Date;
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
  | { kind: "not_recorded" }
  | { kind: "unreachable" };

export interface MercadoPagoChargeOrders {
  requestOrder(order: {
    paymentTransactionId: string;
    saleId: string;
    method: MercadoPagoPaymentTransaction["method"];
    amount: number;
  }): Promise<MercadoPagoChargeOrderAnswer>;
  readOrder(paymentTransactionId: string): Promise<MercadoPagoChargeOrderReading>;
  cancelOrder(paymentTransactionId: string): Promise<MercadoPagoChargeOrderCancellation>;
}

export interface MercadoPagoCharges {
  pendingCharge(paymentTransactionId: string): PendingMercadoPagoCharge | null;
  recordEnded(paymentTransactionId: string, state: EndedMercadoPagoChargeState): void;
  recordWaitEnd(paymentTransactionId: string, waitEndsAt: Date): void;
}

export interface MercadoPagoChargePorts<Refusal, Settlement, ReplacementRefusal = unknown> {
  sale: MercadoPagoChargeSale<Refusal, Settlement, ReplacementRefusal>;
  orders: MercadoPagoChargeOrders;
  charges: MercadoPagoCharges;
  clock: Clock;
}
