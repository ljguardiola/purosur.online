import {
  isRetryableCloudError,
  type MercadoPagoOrderRequestBody,
  mercadoPagoCancellationSchema,
  mercadoPagoPaymentSchema,
} from "@purosur/contracts";
import { MERCADO_PAGO_ORDER_CHARGE_CHECK_INTERVAL_MS } from "@purosur/domain";
import type {
  MercadoPagoChargeOrderAnswer,
  MercadoPagoChargeOrderCancellation,
  MercadoPagoChargeOrderReading,
  MercadoPagoChargeOrders,
} from "@purosur/domain/payments/use-cases";
import type { CloudCallOptions, CloudResponse } from "../platform/cloud-client";

export interface CloudMercadoPagoChargeOrdersDeps {
  readDeviceToken: () => Promise<string | undefined>;
  post: (
    path: string,
    bearerToken: string,
    body: unknown,
    options?: CloudCallOptions,
  ) => Promise<CloudResponse>;
  get: (path: string, bearerToken: string, options: CloudCallOptions) => Promise<CloudResponse>;
  now: () => Date;
}

const ORDERS_PATH = "/api/payments/mercado-pago/orders";
const UNREACHABLE = { kind: "unreachable" } as const;

function orderAnswerOf(
  response: CloudResponse,
  method: "QR" | "POINT",
): MercadoPagoChargeOrderAnswer {
  if (response.kind === "unreachable") {
    return UNREACHABLE;
  }
  if (response.kind === "error") {
    if (method === "POINT" && response.error.code === "payment_provider_not_configured") {
      return { kind: "not_configured" };
    }
    if (method === "POINT" && response.error.code === "validation_failed") {
      return { kind: "below_minimum" };
    }
    return isRetryableCloudError(response.error.code) ? UNREACHABLE : { kind: "refused" };
  }
  const payment = mercadoPagoPaymentSchema.safeParse(response.body);
  return payment.success
    ? { kind: "created", expiresAt: new Date(payment.data.expires_at) }
    : UNREACHABLE;
}

function orderReadingOf(
  response: CloudResponse,
  paymentTransactionId: string,
): MercadoPagoChargeOrderReading {
  if (response.kind !== "ok") {
    return UNREACHABLE;
  }
  const payment = mercadoPagoPaymentSchema.safeParse(response.body);
  if (!payment.success || payment.data.payment_transaction_id !== paymentTransactionId) {
    return UNREACHABLE;
  }
  return { kind: "read", state: payment.data.state };
}

function orderCancellationOf(
  response: CloudResponse,
  paymentTransactionId: string,
): MercadoPagoChargeOrderCancellation {
  if (response.kind !== "ok") {
    return UNREACHABLE;
  }
  const cancellation = mercadoPagoCancellationSchema.safeParse(response.body);
  if (!cancellation.success || cancellation.data.payment_transaction_id !== paymentTransactionId) {
    return UNREACHABLE;
  }
  return cancellation.data.cancel_on_terminal
    ? { kind: "cancel_on_terminal" }
    : { kind: "answered", state: cancellation.data.state };
}

export class CloudMercadoPagoChargeOrders implements MercadoPagoChargeOrders {
  private readonly deps: CloudMercadoPagoChargeOrdersDeps;
  private lastCheck:
    | { paymentTransactionId: string; at: Date; reading: MercadoPagoChargeOrderReading }
    | undefined;

  constructor(deps: CloudMercadoPagoChargeOrdersDeps) {
    this.deps = deps;
  }

  async requestOrder(order: {
    paymentTransactionId: string;
    saleId: string;
    method: "QR" | "POINT";
    amount: number;
  }): Promise<MercadoPagoChargeOrderAnswer> {
    const deviceToken = await this.deps.readDeviceToken();
    if (deviceToken === undefined) {
      return { kind: "refused" };
    }
    const body: MercadoPagoOrderRequestBody = {
      payment_transaction_id: order.paymentTransactionId,
      sale_id: order.saleId,
      provider: order.method === "POINT" ? "MERCADOPAGO_POINT" : "MERCADOPAGO_QR",
      amount: order.amount,
    };
    return orderAnswerOf(await this.deps.post(ORDERS_PATH, deviceToken, body), order.method);
  }

  async readOrder(paymentTransactionId: string): Promise<MercadoPagoChargeOrderReading> {
    const now = this.deps.now();
    if (
      this.lastCheck?.paymentTransactionId === paymentTransactionId &&
      now.getTime() - this.lastCheck.at.getTime() < MERCADO_PAGO_ORDER_CHARGE_CHECK_INTERVAL_MS
    ) {
      return this.lastCheck.reading;
    }
    const deviceToken = await this.deps.readDeviceToken();
    if (deviceToken === undefined) {
      return UNREACHABLE;
    }
    const response = await this.deps.get(
      `/api/payments/mercado-pago/${encodeURIComponent(paymentTransactionId)}`,
      deviceToken,
      { timeoutMs: MERCADO_PAGO_ORDER_CHARGE_CHECK_INTERVAL_MS, singleAttempt: true },
    );
    const reading = orderReadingOf(response, paymentTransactionId);
    this.lastCheck = { paymentTransactionId, at: now, reading };
    return reading;
  }

  async cancelOrder(paymentTransactionId: string): Promise<MercadoPagoChargeOrderCancellation> {
    const deviceToken = await this.deps.readDeviceToken();
    if (deviceToken === undefined) {
      return UNREACHABLE;
    }
    const response = await this.deps.post(
      `/api/payments/mercado-pago/${encodeURIComponent(paymentTransactionId)}/cancel`,
      deviceToken,
      undefined,
      { timeoutMs: MERCADO_PAGO_ORDER_CHARGE_CHECK_INTERVAL_MS, singleAttempt: true },
    );
    return orderCancellationOf(response, paymentTransactionId);
  }
}
