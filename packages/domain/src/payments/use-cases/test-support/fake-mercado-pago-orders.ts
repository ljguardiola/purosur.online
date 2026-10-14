import type { MercadoPagoRefundAnswer } from "../../model/mercado-pago-refund.js";
import type { MercadoPagoOrderTransaction } from "../../model/payment-transaction.js";
import type {
  MercadoPagoOrderCancellation,
  MercadoPagoOrderCreation,
  MercadoPagoOrderReading,
  MercadoPagoOrderRefundsReading,
  MercadoPagoOrders,
  MercadoPagoPointOrderRequest,
  MercadoPagoQrOrderRequest,
} from "../mercado-pago-order-ports.js";
import type { FakePaymentTransactionLanes } from "./fake-payment-transaction-lanes.js";

export class FakeMercadoPagoOrders implements MercadoPagoOrders {
  readonly longestCallMs = 10_000;
  readonly creationRequests: MercadoPagoQrOrderRequest[] = [];
  readonly pointCreationRequests: MercadoPagoPointOrderRequest[] = [];
  readonly readOrders: string[] = [];
  readonly cancellations: { orderId: string; idempotencyKey: string }[] = [];
  readonly refundRequests: { orderId: string; idempotencyKey: string }[] = [];
  readonly refundReadings: string[] = [];
  refundAnswer: MercadoPagoRefundAnswer = {
    kind: "refunded",
    providerRefundId: "REF-1",
    processed: false,
  };
  readonly queuedRefundAnswers: MercadoPagoRefundAnswer[] = [];
  orderRefunds: MercadoPagoOrderRefundsReading = { kind: "read", refunds: [] };
  heldLaneDuringCall: boolean | undefined;
  transactionsRecordedDuringCall: string[] | undefined;
  recordedDuringCreation: MercadoPagoOrderTransaction | undefined;
  creationStopsMidway = false;
  creation: MercadoPagoOrderCreation;
  pointCreation: MercadoPagoOrderCreation;
  reading: MercadoPagoOrderReading;
  cancellation: MercadoPagoOrderCancellation = {
    kind: "cancelled",
    result: {
      status: "canceled",
      statusDetail: "canceled",
      externalReference: null,
      totalPaidAmount: null,
      payments: [],
    },
  };
  readonly readingsByOrder = new Map<string, MercadoPagoOrderReading>();
  readonly queuedReadings: MercadoPagoOrderReading[] = [];
  private readonly lanes: FakePaymentTransactionLanes;

  constructor(
    lanes: FakePaymentTransactionLanes,
    answers: {
      creation: MercadoPagoOrderCreation;
      pointCreation: MercadoPagoOrderCreation;
      reading: MercadoPagoOrderReading;
    },
  ) {
    this.lanes = lanes;
    this.creation = answers.creation;
    this.pointCreation = answers.pointCreation;
    this.reading = answers.reading;
  }

  async createQrOrder(request: MercadoPagoQrOrderRequest): Promise<MercadoPagoOrderCreation> {
    this.lanes.operations.push("createQrOrder");
    this.creationRequests.push(request);
    this.observeLane();
    const recorded = this.lanes.transactions.get(request.externalReference);
    this.recordedDuringCreation = recorded && structuredClone(recorded);
    if (this.creationStopsMidway) {
      throw new Error("createQrOrder stopped midway");
    }
    return this.creation;
  }

  async createPointOrder(request: MercadoPagoPointOrderRequest): Promise<MercadoPagoOrderCreation> {
    this.lanes.operations.push("createPointOrder");
    this.pointCreationRequests.push(request);
    this.observeLane();
    const recorded = this.lanes.transactions.get(request.externalReference);
    this.recordedDuringCreation = recorded && structuredClone(recorded);
    if (this.creationStopsMidway) {
      throw new Error("createPointOrder stopped midway");
    }
    return this.pointCreation;
  }

  async readOrder(orderId: string): Promise<MercadoPagoOrderReading> {
    this.lanes.operations.push("readOrder");
    this.readOrders.push(orderId);
    this.observeLane();
    return this.queuedReadings.shift() ?? this.readingsByOrder.get(orderId) ?? this.reading;
  }

  async cancelOrder(
    orderId: string,
    idempotencyKey: string,
  ): Promise<MercadoPagoOrderCancellation> {
    this.lanes.operations.push("cancelOrder");
    this.cancellations.push({ orderId, idempotencyKey });
    this.observeLane();
    return this.cancellation;
  }

  async refundOrder(orderId: string, idempotencyKey: string): Promise<MercadoPagoRefundAnswer> {
    this.lanes.operations.push("refundOrder");
    this.refundRequests.push({ orderId, idempotencyKey });
    this.observeLane();
    return this.queuedRefundAnswers.shift() ?? this.refundAnswer;
  }

  async readOrderRefunds(orderId: string): Promise<MercadoPagoOrderRefundsReading> {
    this.lanes.operations.push("readOrderRefunds");
    this.refundReadings.push(orderId);
    this.observeLane();
    return this.orderRefunds;
  }

  private observeLane() {
    this.heldLaneDuringCall = this.lanes.held;
    this.transactionsRecordedDuringCall = [...this.lanes.transactions.keys()];
  }
}
