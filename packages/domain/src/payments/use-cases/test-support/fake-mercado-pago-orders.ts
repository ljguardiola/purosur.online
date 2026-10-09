import type { ProviderPaymentTransaction } from "../../model/payment-transaction.js";
import type {
  MercadoPagoOrderCreation,
  MercadoPagoOrderReading,
  MercadoPagoOrders,
  MercadoPagoQrOrderRequest,
} from "../mercado-pago-qr-order-ports.js";
import type { FakePaymentTransactionLanes } from "./fake-payment-transaction-lanes.js";

export class FakeMercadoPagoOrders implements MercadoPagoOrders {
  readonly longestCallMs = 10_000;
  readonly creationRequests: MercadoPagoQrOrderRequest[] = [];
  readonly readOrders: string[] = [];
  heldLaneDuringCall: boolean | undefined;
  transactionsRecordedDuringCall: string[] | undefined;
  recordedDuringCreation: ProviderPaymentTransaction | undefined;
  creationStopsMidway = false;
  creation: MercadoPagoOrderCreation;
  reading: MercadoPagoOrderReading;
  private readonly lanes: FakePaymentTransactionLanes;

  constructor(
    lanes: FakePaymentTransactionLanes,
    answers: { creation: MercadoPagoOrderCreation; reading: MercadoPagoOrderReading },
  ) {
    this.lanes = lanes;
    this.creation = answers.creation;
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

  async readOrder(orderId: string): Promise<MercadoPagoOrderReading> {
    this.lanes.operations.push("readOrder");
    this.readOrders.push(orderId);
    this.observeLane();
    return this.reading;
  }

  private observeLane() {
    this.heldLaneDuringCall = this.lanes.held;
    this.transactionsRecordedDuringCall = [...this.lanes.transactions.keys()];
  }
}
