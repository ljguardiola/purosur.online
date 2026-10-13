import type { PaymentTransactionState } from "../../model/payment-transaction.js";
import type {
  EndedMercadoPagoChargeState,
  MercadoPagoChargeOrder,
  MercadoPagoChargeOrderAnswer,
  MercadoPagoChargeOrderCancellation,
  MercadoPagoChargeOrderReading,
  MercadoPagoChargeOrders,
  MercadoPagoChargeSale,
  MercadoPagoCharges,
  PendingMercadoPagoCharge,
  PendingMercadoPagoPayment,
} from "../mercado-pago-charge-ports.js";

export const CHARGE_NOW = new Date("2026-10-09T12:00:00.000Z");
export const CHARGE_WAIT_ENDS_AT = new Date("2026-10-09T12:03:00.000Z");
export const CHARGE_PAYMENT_ID = "019a0000-0000-7000-8000-0000000000a1";
export const CHARGE_SALE_ID = "019a0000-0000-7000-8000-0000000000b1";
export const CHARGE_ACTOR_ID = "019a0000-0000-7000-8000-0000000000c1";

export type SaleRefusal = { kind: "no_open_sale" } | { kind: "exceeds_pending"; pending: number };
export type SaleSettlement =
  | { kind: "completed"; saleId: string; total: number }
  | { kind: "partially_paid"; saleId: string; total: number; paid: number; pending: number };

export class FakeMercadoPagoChargeWorld
  implements
    MercadoPagoChargeOrders,
    MercadoPagoCharges,
    MercadoPagoChargeSale<SaleRefusal, SaleSettlement, SaleRefusal>
{
  readonly operations: string[] = [];
  readonly charges = new Map<
    string,
    PendingMercadoPagoCharge & { state: PaymentTransactionState; replaced: boolean }
  >();
  readonly recordedPayments: PendingMercadoPagoPayment[] = [];
  readonly settledPayments: { actorId: string; paymentTransactionId: string }[] = [];
  readonly requestedOrders: MercadoPagoChargeOrder[] = [];
  readonly readOrders: string[] = [];
  readonly cancelledOrders: MercadoPagoChargeOrder[] = [];
  readonly replacedPayments: { actorId: string; paymentTransactionId: string; replacedAt: Date }[] =
    [];
  now = CHARGE_NOW;
  saleRefusal: SaleRefusal | undefined;
  replacementRefusal: SaleRefusal | undefined;
  settlement: SaleSettlement = { kind: "completed", saleId: CHARGE_SALE_ID, total: 5000 };
  orderAnswer: MercadoPagoChargeOrderAnswer = {
    kind: "created",
    expiresAt: CHARGE_WAIT_ENDS_AT,
  };
  readonly scriptedReadings: MercadoPagoChargeOrderReading[] = [];
  orderReading: MercadoPagoChargeOrderReading = { kind: "read", state: "PENDING" };
  orderCancellation: MercadoPagoChargeOrderCancellation = {
    kind: "answered",
    state: "CANCELLED",
  };

  readonly clock = { now: () => this.now };

  seedPending(charge: Partial<PendingMercadoPagoCharge> = {}): void {
    const pending = {
      paymentTransactionId: CHARGE_PAYMENT_ID,
      saleId: CHARGE_SALE_ID,
      method: "QR" as PendingMercadoPagoCharge["method"],
      amount: 5000,
      waitEndsAt: CHARGE_WAIT_ENDS_AT,
      ...charge,
    };
    this.charges.set(pending.paymentTransactionId, {
      ...pending,
      state: "PENDING",
      replaced: false,
    });
  }

  recordPendingPayment(
    payment: PendingMercadoPagoPayment,
  ):
    | { kind: "recorded"; paymentTransactionId: string }
    | { kind: "refused"; refusal: SaleRefusal } {
    this.operations.push("recordPendingPayment");
    if (this.saleRefusal !== undefined) {
      return { kind: "refused", refusal: this.saleRefusal };
    }
    this.recordedPayments.push(payment);
    this.seedPending({ ...payment, paymentTransactionId: CHARGE_PAYMENT_ID });
    return { kind: "recorded", paymentTransactionId: CHARGE_PAYMENT_ID };
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

  async requestOrder(order: MercadoPagoChargeOrder): Promise<MercadoPagoChargeOrderAnswer> {
    this.operations.push("requestOrder");
    this.requestedOrders.push(order);
    return this.orderAnswer;
  }

  async readOrder(paymentTransactionId: string): Promise<MercadoPagoChargeOrderReading> {
    this.operations.push("readOrder");
    this.readOrders.push(paymentTransactionId);
    return this.scriptedReadings.shift() ?? this.orderReading;
  }

  async cancelOrder(order: MercadoPagoChargeOrder): Promise<MercadoPagoChargeOrderCancellation> {
    this.operations.push("cancelOrder");
    this.cancelledOrders.push(order);
    return this.orderCancellation;
  }

  pendingCharge(paymentTransactionId: string): PendingMercadoPagoCharge | null {
    const charge = this.charges.get(paymentTransactionId);
    if (charge === undefined || charge.state !== "PENDING" || charge.replaced) {
      return null;
    }
    const { state: _state, replaced: _replaced, ...pending } = charge;
    return pending;
  }

  recordEnded(paymentTransactionId: string, state: EndedMercadoPagoChargeState): void {
    this.operations.push(`recordEnded:${state}`);
    const charge = this.charges.get(paymentTransactionId);
    if (charge !== undefined) {
      charge.state = state;
    }
  }

  recordWaitEnd(paymentTransactionId: string, waitEndsAt: Date): void {
    this.operations.push(`recordWaitEnd:${waitEndsAt.toISOString()}`);
    const charge = this.charges.get(paymentTransactionId);
    if (charge !== undefined && charge.state === "PENDING") {
      charge.waitEndsAt = waitEndsAt;
    }
  }

  get ports() {
    return { sale: this, orders: this, charges: this, clock: this.clock };
  }
}
