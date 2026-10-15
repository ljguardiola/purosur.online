import type { MercadoPagoOrderRefund, MercadoPagoRefundAnswer } from "@purosur/domain";
import type {
  MercadoPagoOrderCancellation,
  MercadoPagoOrderCreation,
  MercadoPagoOrderReading,
  MercadoPagoOrderRefundsReading,
  MercadoPagoOrders,
  MercadoPagoPointOrderRequest,
  MercadoPagoQrOrderRequest,
} from "@purosur/domain/payments/use-cases";
import { z } from "zod";

export interface MercadoPagoOrdersClientOptions {
  accessToken: string;
  externalPosId: string;
  fetch?: typeof globalThis.fetch;
}

const MERCADO_PAGO_API_URL = "https://api.mercadopago.com";
const MERCADO_PAGO_TIMEOUT_MS = 10_000;
const CENTS_PER_PESO = 100;
const DECIMAL_AMOUNT = /^(\d+)(?:\.(\d{1,2}))?$/;
const REQUEST_TIMEOUT = 408;
const TOO_MANY_REQUESTS = 429;
const CONFLICT = 409;
const UNPROCESSABLE = 422;
const BAD_REQUEST = 400;
const INSUFFICIENT_MONEY = 428;
const ALREADY_REFUNDED_CODE = "order_already_refunded";
const FINAL_REFUSAL_CODES: ReadonlyMap<number, readonly string[]> = new Map([
  [CONFLICT, ["cannot_refund_order", "refund_period_exceeded", "idempotency_key_already_used"]],
  [UNPROCESSABLE, ["payment_not_refundable"]],
  [BAD_REQUEST, ["in_store_payment_refund_order"]],
]);

function pesosOfCents(cents: number): string {
  const pesos = Math.floor(cents / CENTS_PER_PESO);
  const remainder = String(cents % CENTS_PER_PESO).padStart(2, "0");
  return `${pesos}.${remainder}`;
}

function centsOfPesos(pesos: string): number | null {
  const match = DECIMAL_AMOUNT.exec(pesos);
  if (match === null) {
    return null;
  }
  const cents = Number(match[1]) * CENTS_PER_PESO + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

const amountSchema = z.string().transform((pesos, context) => {
  const cents = centsOfPesos(pesos);
  if (cents === null) {
    context.addIssue({ code: "custom", message: "not an amount in pesos" });
    return z.NEVER;
  }
  return cents;
});

function orderAnswerSchemaWith<TPaymentDetail extends z.ZodType<string | undefined>>(
  paymentDetailSchema: TPaymentDetail,
) {
  return z.object({
    id: z.string().min(1),
    status: z.string(),
    status_detail: z.string(),
    external_reference: z.string().optional(),
    total_paid_amount: amountSchema.optional(),
    transactions: z
      .object({
        payments: z.array(
          z.object({
            status: z.string(),
            status_detail: paymentDetailSchema,
            paid_amount: amountSchema.optional(),
          }),
        ),
      })
      .optional(),
  });
}

const orderAnswerSchema = orderAnswerSchemaWith(z.string());
const createdOrderAnswerSchema = orderAnswerSchemaWith(z.string().optional());

function parsedOrder(
  body: unknown,
  schema: typeof orderAnswerSchema | typeof createdOrderAnswerSchema = orderAnswerSchema,
) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return null;
  }
  const answer = parsed.data;
  return {
    orderId: answer.id,
    result: {
      status: answer.status,
      statusDetail: answer.status_detail,
      externalReference: answer.external_reference ?? null,
      totalPaidAmount: answer.total_paid_amount ?? null,
      payments: (answer.transactions?.payments ?? []).map((payment) => ({
        status: payment.status,
        statusDetail: payment.status_detail ?? null,
        paidAmount: payment.paid_amount ?? null,
      })),
    },
  };
}

const refundsSchema = z.object({
  transactions: z
    .object({
      refunds: z.array(z.object({ id: z.string().min(1), status: z.string() })).optional(),
    })
    .optional(),
});

const refundedAnswerSchema = z.object({
  transactions: z.object({
    refunds: z.array(z.object({ id: z.string().min(1), status: z.string() })).min(1),
  }),
});

const conflictAnswerSchema = z.object({ errors: z.array(z.object({ code: z.string() })).min(1) });
const ERROR_CODE_SHAPE = /^[a-z][a-z0-9_]{0,63}$/;

function conflictCode(body: unknown): string | null {
  const parsed = conflictAnswerSchema.safeParse(body);
  return parsed.success ? (parsed.data.errors[0]?.code ?? null) : null;
}

function loggableErrorCode(body: unknown): string | null {
  const code = conflictCode(body);
  return code !== null && ERROR_CODE_SHAPE.test(code) ? code : null;
}

function notRefunded(status: AnswerStatus, body: unknown): MercadoPagoRefundAnswer {
  warnOfAnswer("Mercado Pago did not refund the order", status, body);
  return { kind: "unavailable" };
}

function notReadRefunds(status: AnswerStatus, body: unknown): MercadoPagoOrderRefundsReading {
  warnOfAnswer("Mercado Pago did not answer the refunds of the order", status, body);
  return { kind: "unavailable" };
}

function refundAnswerOf(status: number, body: unknown): MercadoPagoRefundAnswer {
  if (status >= 200 && status < 300) {
    const parsed = refundedAnswerSchema.safeParse(body);
    const refund = parsed.success ? parsed.data.transactions.refunds.at(-1) : undefined;
    return refund === undefined
      ? notRefunded(status, body)
      : { kind: "refunded", providerRefundId: refund.id, processed: refund.status === "processed" };
  }
  const code = conflictCode(body);
  if (status === INSUFFICIENT_MONEY && code === "insufficient_money_for_refund") {
    return { kind: "insufficient_balance" };
  }
  if (status === CONFLICT && code === ALREADY_REFUNDED_CODE) {
    return { kind: "already_refunded" };
  }
  if (code !== null && FINAL_REFUSAL_CODES.get(status)?.includes(code)) {
    return { kind: "refused", reason: code };
  }
  return notRefunded(status, body);
}

type AnswerStatus = number | "unreachable";

function warnOfAnswer(message: string, status: AnswerStatus, body: unknown): void {
  console.warn(message, { status, code: loggableErrorCode(body) });
}

function notCancelled(status: AnswerStatus, body: unknown): MercadoPagoOrderCancellation {
  warnOfAnswer("Mercado Pago did not cancel the order", status, body);
  return { kind: "unavailable" };
}

function notRead(status: AnswerStatus, body: unknown): MercadoPagoOrderReading {
  warnOfAnswer("Mercado Pago did not answer the order", status, body);
  return { kind: "unavailable" };
}

type ProviderAnswer = { kind: "answered"; status: number; body: unknown } | { kind: "unreachable" };

export function createMercadoPagoOrdersClient(
  options: MercadoPagoOrdersClientOptions,
): MercadoPagoOrders {
  const doFetch = options.fetch ?? globalThis.fetch;

  async function call(path: string, init: RequestInit): Promise<ProviderAnswer> {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), MERCADO_PAGO_TIMEOUT_MS);
    try {
      const response = await doFetch(`${MERCADO_PAGO_API_URL}${path}`, {
        ...init,
        signal: abort.signal,
      });
      const body: unknown = await response.json().catch(() => null);
      return { kind: "answered", status: response.status, body };
    } catch {
      return { kind: "unreachable" };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function createOrder(
    request: { idempotencyKey: string },
    body: Record<string, unknown>,
  ): Promise<MercadoPagoOrderCreation> {
    const answer = await call("/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": request.idempotencyKey,
      },
      body: JSON.stringify(body),
    });
    if (answer.kind === "unreachable" || answer.status >= 500) {
      return { kind: "unavailable" };
    }
    if (answer.status >= 200 && answer.status < 300) {
      const order = parsedOrder(answer.body, createdOrderAnswerSchema);
      return order === null ? { kind: "unavailable" } : { kind: "created", ...order };
    }
    if (answer.status === REQUEST_TIMEOUT) {
      return { kind: "unavailable" };
    }
    if (answer.status === TOO_MANY_REQUESTS) {
      return { kind: "throttled" };
    }
    return { kind: "refused" };
  }

  return {
    longestCallMs: MERCADO_PAGO_TIMEOUT_MS,

    createQrOrder(request: MercadoPagoQrOrderRequest): Promise<MercadoPagoOrderCreation> {
      const amount = pesosOfCents(request.amount);
      return createOrder(request, {
        type: "qr",
        total_amount: amount,
        external_reference: request.externalReference,
        expiration_time: `PT${request.expiresAfterMinutes}M`,
        config: { qr: { external_pos_id: options.externalPosId, mode: "static" } },
        transactions: { payments: [{ amount }] },
      });
    },

    async createPointOrder(
      request: MercadoPagoPointOrderRequest,
    ): Promise<MercadoPagoOrderCreation> {
      return createOrder(request, {
        type: "point",
        external_reference: request.externalReference,
        expiration_time: `PT${request.expiresAfterMinutes}M`,
        transactions: { payments: [{ amount: pesosOfCents(request.amount) }] },
        config: { point: { terminal_id: request.terminalId, print_on_terminal: "no_ticket" } },
      });
    },

    async readOrder(orderId: string): Promise<MercadoPagoOrderReading> {
      const answer = await call(`/v1/orders/${encodeURIComponent(orderId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${options.accessToken}` },
      });
      if (answer.kind === "unreachable") {
        return notRead("unreachable", null);
      }
      if (answer.status < 200 || answer.status >= 300) {
        return notRead(answer.status, answer.body);
      }
      const order = parsedOrder(answer.body);
      return order === null
        ? notRead(answer.status, answer.body)
        : { kind: "read", result: order.result };
    },

    async refundOrder(orderId: string, idempotencyKey: string): Promise<MercadoPagoRefundAnswer> {
      const answer = await call(`/v1/orders/${encodeURIComponent(orderId)}/refund`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          "X-Idempotency-Key": idempotencyKey,
        },
      });
      return answer.kind === "unreachable"
        ? notRefunded("unreachable", null)
        : refundAnswerOf(answer.status, answer.body);
    },

    async readOrderRefunds(orderId: string): Promise<MercadoPagoOrderRefundsReading> {
      const answer = await call(`/v1/orders/${encodeURIComponent(orderId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${options.accessToken}` },
      });
      if (answer.kind === "unreachable") {
        return notReadRefunds("unreachable", null);
      }
      const parsed = refundsSchema.safeParse(answer.body);
      if (answer.status < 200 || answer.status >= 300 || !parsed.success) {
        return notReadRefunds(answer.status, answer.body);
      }
      const refunds: MercadoPagoOrderRefund[] = parsed.data.transactions?.refunds ?? [];
      return { kind: "read", refunds };
    },

    async cancelOrder(
      orderId: string,
      idempotencyKey: string,
    ): Promise<MercadoPagoOrderCancellation> {
      const answer = await call(`/v1/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          "X-Idempotency-Key": idempotencyKey,
        },
      });
      if (answer.kind === "unreachable") {
        return notCancelled("unreachable", null);
      }
      if (answer.status >= 200 && answer.status < 300) {
        const order = parsedOrder(answer.body);
        return order === null
          ? notCancelled(answer.status, answer.body)
          : { kind: "cancelled", result: order.result };
      }
      if (answer.status === CONFLICT) {
        const code = conflictCode(answer.body);
        if (
          code === "cannot_cancel_order" ||
          code === "order_already_canceled" ||
          code === "instore_order_locked_error"
        ) {
          return { kind: "cannot_cancel" };
        }
      }
      return notCancelled(answer.status, answer.body);
    },
  };
}
