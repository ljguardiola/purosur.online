import type {
  MercadoPagoOrderCancellation,
  MercadoPagoOrderCreation,
  MercadoPagoOrderReading,
  MercadoPagoOrders,
  MercadoPagoPointOrderCreation,
  MercadoPagoPointOrderRequest,
  MercadoPagoQrOrderRequest,
} from "@purosur/domain/payments/use-cases";

export const NOW = new Date("2026-10-09T12:00:00.000Z");
export const ORDER_ID = "ORD01JQ4S4KY8HWQ6NA5PXB65B3D3";

export const UNPAID_ORDER = {
  status: "created",
  statusDetail: "created",
  externalReference: null,
  totalPaidAmount: null,
  payments: [{ status: "created", statusDetail: "ready_to_process", paidAmount: null }],
} as const;

export const PAID_ORDER = {
  status: "processed",
  statusDetail: "accredited",
  externalReference: null,
  totalPaidAmount: 5000,
  payments: [{ status: "processed", statusDetail: "accredited", paidAmount: 5000 }],
} as const;

export const AT_TERMINAL_ORDER = {
  status: "at_terminal",
  statusDetail: "at_terminal",
  externalReference: null,
  totalPaidAmount: null,
  payments: [{ status: "at_terminal", statusDetail: "at_terminal", paidAmount: null }],
} as const;

const CANCELLED_ORDER = {
  status: "canceled",
  statusDetail: "canceled",
  externalReference: null,
  totalPaidAmount: null,
  payments: [{ status: "canceled", statusDetail: "canceled_by_api", paidAmount: null }],
} as const;

export class FakeMercadoPagoOrders implements MercadoPagoOrders {
  readonly longestCallMs = 10_000;
  readonly creations: MercadoPagoQrOrderRequest[] = [];
  readonly pointCreations: MercadoPagoPointOrderRequest[] = [];
  readonly readings: string[] = [];
  readonly cancellations: { orderId: string; idempotencyKey: string }[] = [];
  creation: MercadoPagoOrderCreation = { kind: "created", orderId: ORDER_ID, result: UNPAID_ORDER };
  pointCreation: MercadoPagoPointOrderCreation = {
    kind: "created",
    orderId: ORDER_ID,
    result: UNPAID_ORDER,
  };
  reading: MercadoPagoOrderReading = { kind: "read", result: UNPAID_ORDER };
  cancellation: MercadoPagoOrderCancellation = { kind: "cancelled", result: CANCELLED_ORDER };

  async createQrOrder(request: MercadoPagoQrOrderRequest): Promise<MercadoPagoOrderCreation> {
    this.creations.push(request);
    return this.creation;
  }

  async createPointOrder(
    request: MercadoPagoPointOrderRequest,
  ): Promise<MercadoPagoPointOrderCreation> {
    this.pointCreations.push(request);
    return this.pointCreation;
  }

  async readOrder(orderId: string): Promise<MercadoPagoOrderReading> {
    this.readings.push(orderId);
    return this.reading;
  }

  async cancelOrder(
    orderId: string,
    idempotencyKey: string,
  ): Promise<MercadoPagoOrderCancellation> {
    this.cancellations.push({ orderId, idempotencyKey });
    return this.cancellation;
  }
}
