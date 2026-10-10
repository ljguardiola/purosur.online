import {
  isRetryableCloudError,
  type MercadoPagoQrOrderRequestBody,
  mercadoPagoQrPaymentSchema,
} from "@purosur/contracts";
import { MERCADO_PAGO_QR_CHARGE_CHECK_INTERVAL_MS } from "@purosur/domain";
import type {
  MercadoPagoQrChargeOrderAnswer,
  MercadoPagoQrChargeOrderReading,
  MercadoPagoQrChargeOrders,
} from "@purosur/domain/payments/use-cases";
import type { CloudCallOptions, CloudResponse } from "../platform/cloud-client";

export interface CloudMercadoPagoQrChargeOrdersDeps {
  readDeviceToken: () => Promise<string | undefined>;
  post: (path: string, bearerToken: string, body: unknown) => Promise<CloudResponse>;
  get: (path: string, bearerToken: string, options: CloudCallOptions) => Promise<CloudResponse>;
  now: () => Date;
}

const ORDERS_PATH = "/api/payments/mercado-pago-qr/orders";
const UNREACHABLE = { kind: "unreachable" } as const;

function orderAnswerOf(response: CloudResponse): MercadoPagoQrChargeOrderAnswer {
  if (response.kind === "unreachable") {
    return UNREACHABLE;
  }
  if (response.kind === "error") {
    return isRetryableCloudError(response.error.code) ? UNREACHABLE : { kind: "refused" };
  }
  return mercadoPagoQrPaymentSchema.safeParse(response.body).success
    ? { kind: "created" }
    : UNREACHABLE;
}

function orderReadingOf(
  response: CloudResponse,
  paymentTransactionId: string,
): MercadoPagoQrChargeOrderReading {
  if (response.kind !== "ok") {
    return UNREACHABLE;
  }
  const payment = mercadoPagoQrPaymentSchema.safeParse(response.body);
  if (!payment.success || payment.data.payment_transaction_id !== paymentTransactionId) {
    return UNREACHABLE;
  }
  return { kind: "read", state: payment.data.state };
}

export class CloudMercadoPagoQrChargeOrders implements MercadoPagoQrChargeOrders {
  private readonly deps: CloudMercadoPagoQrChargeOrdersDeps;
  private lastCheck:
    | { paymentTransactionId: string; at: Date; reading: MercadoPagoQrChargeOrderReading }
    | undefined;

  constructor(deps: CloudMercadoPagoQrChargeOrdersDeps) {
    this.deps = deps;
  }

  async requestOrder(order: {
    paymentTransactionId: string;
    saleId: string;
    amount: number;
  }): Promise<MercadoPagoQrChargeOrderAnswer> {
    const deviceToken = await this.deps.readDeviceToken();
    if (deviceToken === undefined) {
      return { kind: "refused" };
    }
    const body: MercadoPagoQrOrderRequestBody = {
      payment_transaction_id: order.paymentTransactionId,
      sale_id: order.saleId,
      amount: order.amount,
    };
    return orderAnswerOf(await this.deps.post(ORDERS_PATH, deviceToken, body));
  }

  async readOrder(paymentTransactionId: string): Promise<MercadoPagoQrChargeOrderReading> {
    const now = this.deps.now();
    if (
      this.lastCheck?.paymentTransactionId === paymentTransactionId &&
      now.getTime() - this.lastCheck.at.getTime() < MERCADO_PAGO_QR_CHARGE_CHECK_INTERVAL_MS
    ) {
      return this.lastCheck.reading;
    }
    const deviceToken = await this.deps.readDeviceToken();
    if (deviceToken === undefined) {
      return UNREACHABLE;
    }
    const response = await this.deps.get(
      `/api/payments/mercado-pago-qr/${encodeURIComponent(paymentTransactionId)}`,
      deviceToken,
      { timeoutMs: MERCADO_PAGO_QR_CHARGE_CHECK_INTERVAL_MS, singleAttempt: true },
    );
    const reading = orderReadingOf(response, paymentTransactionId);
    this.lastCheck = { paymentTransactionId, at: now, reading };
    return reading;
  }
}
