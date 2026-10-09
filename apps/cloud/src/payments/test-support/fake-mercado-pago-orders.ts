import type {
  MercadoPagoOrderCreation,
  MercadoPagoOrderReading,
  MercadoPagoOrders,
  MercadoPagoQrOrderRequest,
} from "@purosur/domain/payments/use-cases";

export const NOW = new Date("2026-10-09T12:00:00.000Z");
export const ORDER_ID = "ORD01JQ4S4KY8HWQ6NA5PXB65B3D3";

export const UNPAID_ORDER = {
  status: "created",
  statusDetail: "created",
  totalPaidAmount: null,
  payments: [{ status: "created", statusDetail: "ready_to_process", paidAmount: null }],
} as const;

export const PAID_ORDER = {
  status: "processed",
  statusDetail: "accredited",
  totalPaidAmount: 5000,
  payments: [{ status: "processed", statusDetail: "accredited", paidAmount: 5000 }],
} as const;

export class FakeMercadoPagoOrders implements MercadoPagoOrders {
  readonly longestCallMs = 10_000;
  readonly creations: MercadoPagoQrOrderRequest[] = [];
  readonly readings: string[] = [];
  creation: MercadoPagoOrderCreation = { kind: "created", orderId: ORDER_ID, result: UNPAID_ORDER };
  reading: MercadoPagoOrderReading = { kind: "read", result: UNPAID_ORDER };

  async createQrOrder(request: MercadoPagoQrOrderRequest): Promise<MercadoPagoOrderCreation> {
    this.creations.push(request);
    return this.creation;
  }

  async readOrder(orderId: string): Promise<MercadoPagoOrderReading> {
    this.readings.push(orderId);
    return this.reading;
  }
}
