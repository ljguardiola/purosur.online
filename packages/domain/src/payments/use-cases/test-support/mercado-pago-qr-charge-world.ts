import type { PaymentTransactionState } from "../../model/payment-transaction.js";
import type {
  EndedMercadoPagoQrChargeState,
  MercadoPagoQrChargeOrderAnswer,
  MercadoPagoQrChargeOrderCancellation,
  MercadoPagoQrChargeOrderReading,
  MercadoPagoQrChargeOrders,
  MercadoPagoQrChargeSale,
  MercadoPagoQrCharges,
  PendingMercadoPagoQrCharge,
  PendingMercadoPagoQrPayment,
} from "../mercado-pago-qr-charge-ports.js";

export const QR_CHARGE_NOW = new Date("2026-10-09T12:00:00.000Z");
export const QR_CHARGE_WAIT_ENDS_AT = new Date("2026-10-09T12:03:00.000Z");
export const QR_PAYMENT_ID = "019a0000-0000-7000-8000-0000000000a1";
export const QR_SALE_ID = "019a0000-0000-7000-8000-0000000000b1";
export const QR_ACTOR_ID = "019a0000-0000-7000-8000-0000000000c1";

export type SaleRefusal = { kind: "no_open_sale" } | { kind: "exceeds_pending"; pending: number };
export type SaleSettlement =
  | { kind: "completed"; saleId: string; total: number }
  | { kind: "partially_paid"; saleId: string; total: number; paid: number; pending: number };

export class FakeMercadoPagoQrChargeWorld
  implements
    MercadoPagoQrChargeOrders,
    MercadoPagoQrCharges,
    MercadoPagoQrChargeSale<SaleRefusal, SaleSettlement, SaleRefusal>
{
  readonly operations: string[] = [];
  readonly charges = new Map<
    string,
    PendingMercadoPagoQrCharge & { state: PaymentTransactionState; replaced: boolean }
  >();
  readonly recordedPayments: PendingMercadoPagoQrPayment[] = [];
  readonly settledPayments: { actorId: string; paymentTransactionId: string }[] = [];
  readonly requestedOrders: { paymentTransactionId: string; saleId: string; amount: number }[] = [];
  readonly readOrders: string[] = [];
  readonly cancelledOrders: string[] = [];
  readonly replacedPayments: { actorId: string; paymentTransactionId: string; replacedAt: Date }[] =
    [];
  now = QR_CHARGE_NOW;
  saleRefusal: SaleRefusal | undefined;
  replacementRefusal: SaleRefusal | undefined;
  settlement: SaleSettlement = { kind: "completed", saleId: QR_SALE_ID, total: 5000 };
  orderAnswer: MercadoPagoQrChargeOrderAnswer = { kind: "created" };
  orderReading: MercadoPagoQrChargeOrderReading = { kind: "read", state: "PENDING" };
  orderCancellation: MercadoPagoQrChargeOrderCancellation = {
    kind: "answered",
    state: "CANCELLED",
  };

  readonly clock = { now: () => this.now };

  seedPending(charge: Partial<PendingMercadoPagoQrCharge> = {}): void {
    const pending = {
      paymentTransactionId: QR_PAYMENT_ID,
      saleId: QR_SALE_ID,
      amount: 5000,
      waitEndsAt: QR_CHARGE_WAIT_ENDS_AT,
      ...charge,
    };
    this.charges.set(pending.paymentTransactionId, {
      ...pending,
      state: "PENDING",
      replaced: false,
    });
  }

  recordPendingPayment(
    payment: PendingMercadoPagoQrPayment,
  ):
    | { kind: "recorded"; paymentTransactionId: string }
    | { kind: "refused"; refusal: SaleRefusal } {
    this.operations.push("recordPendingPayment");
    if (this.saleRefusal !== undefined) {
      return { kind: "refused", refusal: this.saleRefusal };
    }
    this.recordedPayments.push(payment);
    this.seedPending({ ...payment, paymentTransactionId: QR_PAYMENT_ID });
    return { kind: "recorded", paymentTransactionId: QR_PAYMENT_ID };
  }

  settleApprovedPayment(settled: {
    actorId: string;
    paymentTransactionId: string;
  }): SaleSettlement {
    this.operations.push("settleApprovedPayment");
    this.settledPayments.push(settled);
    const charge = this.charges.get(settled.paymentTransactionId);
    if (charge !== undefined) {
      charge.state = "APPROVED";
    }
    return this.settlement;
  }

  replacePendingPayment(replaced: {
    actorId: string;
    paymentTransactionId: string;
    replacedAt: Date;
  }): { kind: "replaced" } | { kind: "refused"; refusal: SaleRefusal } {
    this.operations.push("replacePendingPayment");
    if (this.replacementRefusal !== undefined) {
      return { kind: "refused", refusal: this.replacementRefusal };
    }
    this.replacedPayments.push(replaced);
    const charge = this.charges.get(replaced.paymentTransactionId);
    if (charge !== undefined) {
      charge.replaced = true;
      charge.waitEndsAt = replaced.replacedAt;
    }
    return { kind: "replaced" };
  }

  async requestOrder(order: {
    paymentTransactionId: string;
    saleId: string;
    amount: number;
  }): Promise<MercadoPagoQrChargeOrderAnswer> {
    this.operations.push("requestOrder");
    this.requestedOrders.push(order);
    return this.orderAnswer;
  }

  async readOrder(paymentTransactionId: string): Promise<MercadoPagoQrChargeOrderReading> {
    this.operations.push("readOrder");
    this.readOrders.push(paymentTransactionId);
    return this.orderReading;
  }

  async cancelOrder(paymentTransactionId: string): Promise<MercadoPagoQrChargeOrderCancellation> {
    this.operations.push("cancelOrder");
    this.cancelledOrders.push(paymentTransactionId);
    return this.orderCancellation;
  }

  pendingCharge(paymentTransactionId: string): PendingMercadoPagoQrCharge | null {
    const charge = this.charges.get(paymentTransactionId);
    if (charge === undefined || charge.state !== "PENDING" || charge.replaced) {
      return null;
    }
    const { state: _state, replaced: _replaced, ...pending } = charge;
    return pending;
  }

  recordEnded(paymentTransactionId: string, state: EndedMercadoPagoQrChargeState): void {
    this.operations.push(`recordEnded:${state}`);
    const charge = this.charges.get(paymentTransactionId);
    if (charge !== undefined) {
      charge.state = state;
    }
  }

  endWait(paymentTransactionId: string, endedAt: Date): void {
    this.operations.push(`endWait:${endedAt.toISOString()}`);
    const charge = this.charges.get(paymentTransactionId);
    if (charge !== undefined && charge.state === "PENDING") {
      charge.waitEndsAt = endedAt;
    }
  }

  get ports() {
    return { sale: this, orders: this, charges: this, clock: this.clock };
  }
}
