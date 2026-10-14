import type { SaleState } from "../../../sales/index.js";
import type { LocalStateOfPaidOrder } from "../../model/paid-order-discovery.js";
import type { PaymentTransactionState } from "../../model/payment-transaction.js";
import type {
  ApprovedOrderOfRegister,
  ApprovedOrdersAnswer,
  LatePaymentRefundRequestAnswer,
  LatePaymentRefundRequests,
  LocalPaidOrders,
  PaidOrdersOfRegister,
  PaidOrderWithoutSale,
} from "../paid-order-ports.js";
import { FixedClock } from "./fake-refund-store.js";

export const NOW = new Date("2026-10-13T12:00:00.000Z");

export function anApprovedOrder(
  overrides: Partial<ApprovedOrderOfRegister> = {},
): ApprovedOrderOfRegister {
  return {
    paymentTransactionId: "payment-1",
    saleId: "sale-1",
    method: "QR",
    provider: "MERCADOPAGO_QR",
    amount: 2500,
    createdAt: new Date("2026-10-13T11:00:00.000Z"),
    ...overrides,
  };
}

export class FakePaidOrdersOfRegister implements PaidOrdersOfRegister {
  answer: ApprovedOrdersAnswer;
  readonly askedSince: Date[] = [];

  constructor(answer: ApprovedOrdersAnswer) {
    this.answer = answer;
  }

  async approvedSince(since: Date): Promise<ApprovedOrdersAnswer> {
    this.askedSince.push(new Date(since));
    return this.answer;
  }
}

export class FakeLatePaymentRefundRequests implements LatePaymentRefundRequests {
  readonly answers = new Map<string, LatePaymentRefundRequestAnswer>();
  readonly asked: string[] = [];
  private readonly pending = new Set<string>();

  async openLatePaymentRefund(
    paymentTransactionId: string,
  ): Promise<LatePaymentRefundRequestAnswer> {
    this.asked.push(paymentTransactionId);
    const answer = this.answers.get(paymentTransactionId);
    if (answer) {
      return answer;
    }
    const opening = this.pending.has(paymentTransactionId) ? "already_open" : "opened";
    this.pending.add(paymentTransactionId);
    return { kind: opening };
  }

  get pendingRefunds(): string[] {
    return [...this.pending];
  }
}

export class FakeLocalPaidOrders implements LocalPaidOrders {
  readonly payments = new Map<string, PaymentTransactionState>();
  readonly sales = new Map<string, SaleState>();
  readonly applied: string[] = [];
  readonly recordedOrders = new Map<string, PaidOrderWithoutSale>();
  readonly failingToApply = new Set<string>();

  localStateOf(order: ApprovedOrderOfRegister): LocalStateOfPaidOrder {
    return {
      payment: this.payments.get(order.paymentTransactionId),
      sale: this.sales.get(order.saleId),
    };
  }

  applyApprovedPayment(order: ApprovedOrderOfRegister): void {
    if (this.failingToApply.has(order.paymentTransactionId)) {
      throw new Error("the local database refused the payment");
    }
    this.applied.push(order.paymentTransactionId);
    this.payments.set(order.paymentTransactionId, "APPROVED");
  }

  paidOrderWithoutSale(paymentTransactionId: string): PaidOrderWithoutSale | undefined {
    const stored = this.recordedOrders.get(paymentTransactionId);
    return stored && structuredClone(stored);
  }

  recordPaidOrderWithoutSale(order: ApprovedOrderOfRegister, recordedAt: Date): void {
    if (!this.recordedOrders.has(order.paymentTransactionId)) {
      this.recordedOrders.set(order.paymentTransactionId, {
        ...structuredClone(order),
        recordedAt: new Date(recordedAt),
        resolved: false,
      });
    }
  }

  resolvePaidOrderWithoutSale(paymentTransactionId: string, resolvedAt: Date): void {
    const stored = this.recordedOrders.get(paymentTransactionId);
    if (stored) {
      stored.resolved = true;
      stored.resolvedAt = new Date(resolvedAt);
    }
  }

  paidOrdersWithoutSale(): PaidOrderWithoutSale[] {
    return structuredClone([...this.recordedOrders.values()]);
  }
}

export function paidOrderWorld(answer: ApprovedOrdersAnswer = { kind: "listed", orders: [] }) {
  const cloud = new FakePaidOrdersOfRegister(answer);
  const refunds = new FakeLatePaymentRefundRequests();
  const local = new FakeLocalPaidOrders();
  const ports = { cloud, refunds, local, clock: new FixedClock(NOW) };
  return { cloud, refunds, local, ports };
}
