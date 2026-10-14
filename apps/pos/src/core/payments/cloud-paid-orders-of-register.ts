import { approvedOrdersOfRegisterSchema, latePaymentRefundOpeningSchema } from "@purosur/contracts";
import type {
  ApprovedOrdersAnswer,
  LatePaymentRefundRequestAnswer,
  LatePaymentRefundRequests,
  PaidOrdersOfRegister,
} from "@purosur/domain/payments/use-cases";
import type { CloudCallOptions, CloudResponse } from "../platform/cloud-client";

export interface CloudPaidOrdersOfRegisterDeps {
  readDeviceToken: () => Promise<string | undefined>;
  post: (
    path: string,
    bearerToken: string,
    body: unknown,
    options?: CloudCallOptions,
  ) => Promise<CloudResponse>;
  get: (path: string, bearerToken: string, options: CloudCallOptions) => Promise<CloudResponse>;
}

const PAID_ORDERS_TIMEOUT_MS = 10_000;
const CALL: CloudCallOptions = { timeoutMs: PAID_ORDERS_TIMEOUT_MS, singleAttempt: true };
const APPROVED_PATH = "/api/payments/mercado-pago/approved";
const UNREACHABLE = { kind: "unreachable" } as const;

function approvedOrdersOf(response: CloudResponse, since: Date): ApprovedOrdersAnswer {
  if (response.kind !== "ok") {
    return UNREACHABLE;
  }
  const parsed = approvedOrdersOfRegisterSchema.safeParse(response.body);
  if (!parsed.success) {
    return UNREACHABLE;
  }
  return {
    kind: "listed",
    orders: parsed.data.orders
      .map((order) => ({
        paymentTransactionId: order.payment_transaction_id,
        saleId: order.sale_id,
        method: order.method,
        provider: order.provider,
        amount: order.amount,
        createdAt: new Date(order.created_at),
      }))
      .filter((order) => order.createdAt >= since),
  };
}

function openingOf(
  response: CloudResponse,
  paymentTransactionId: string,
): LatePaymentRefundRequestAnswer {
  if (response.kind === "error") {
    return response.error.code === "not_found" || response.error.code === "conflict"
      ? { kind: "refused" }
      : UNREACHABLE;
  }
  if (response.kind !== "ok") {
    return UNREACHABLE;
  }
  const opening = latePaymentRefundOpeningSchema.safeParse(response.body);
  return opening.success && opening.data.payment_transaction_id === paymentTransactionId
    ? { kind: opening.data.opening }
    : UNREACHABLE;
}

export class CloudPaidOrdersOfRegister implements PaidOrdersOfRegister, LatePaymentRefundRequests {
  private readonly deps: CloudPaidOrdersOfRegisterDeps;

  constructor(deps: CloudPaidOrdersOfRegisterDeps) {
    this.deps = deps;
  }

  async approvedSince(since: Date): Promise<ApprovedOrdersAnswer> {
    const deviceToken = await this.deps.readDeviceToken();
    if (deviceToken === undefined) {
      return UNREACHABLE;
    }
    return approvedOrdersOf(await this.deps.get(APPROVED_PATH, deviceToken, CALL), since);
  }

  async openLatePaymentRefund(
    paymentTransactionId: string,
  ): Promise<LatePaymentRefundRequestAnswer> {
    const deviceToken = await this.deps.readDeviceToken();
    if (deviceToken === undefined) {
      return UNREACHABLE;
    }
    const response = await this.deps.post(
      `/api/payments/mercado-pago/${encodeURIComponent(paymentTransactionId)}/late-payment-refund`,
      deviceToken,
      {},
      CALL,
    );
    return openingOf(response, paymentTransactionId);
  }
}
