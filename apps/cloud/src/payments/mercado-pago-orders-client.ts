import type {
  MercadoPagoOrderCreation,
  MercadoPagoOrderReading,
  MercadoPagoOrders,
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
const UNAVAILABLE_STATUSES: readonly number[] = [408, 429];

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

const orderAnswerSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  status_detail: z.string(),
  total_paid_amount: amountSchema.optional(),
  transactions: z
    .object({
      payments: z.array(
        z.object({
          status: z.string(),
          status_detail: z.string(),
          paid_amount: amountSchema.optional(),
        }),
      ),
    })
    .optional(),
});

function parsedOrder(body: unknown) {
  const parsed = orderAnswerSchema.safeParse(body);
  if (!parsed.success) {
    return null;
  }
  const answer = parsed.data;
  return {
    orderId: answer.id,
    result: {
      status: answer.status,
      statusDetail: answer.status_detail,
      totalPaidAmount: answer.total_paid_amount ?? null,
      payments: (answer.transactions?.payments ?? []).map((payment) => ({
        status: payment.status,
        statusDetail: payment.status_detail,
        paidAmount: payment.paid_amount ?? null,
      })),
    },
  };
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

  return {
    longestCallMs: MERCADO_PAGO_TIMEOUT_MS,

    async createQrOrder(request: MercadoPagoQrOrderRequest): Promise<MercadoPagoOrderCreation> {
      const amount = pesosOfCents(request.amount);
      const answer = await call("/v1/orders", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": request.idempotencyKey,
        },
        body: JSON.stringify({
          type: "qr",
          total_amount: amount,
          external_reference: request.externalReference,
          expiration_time: `PT${request.expiresAfterMinutes}M`,
          config: { qr: { external_pos_id: options.externalPosId, mode: "static" } },
          transactions: { payments: [{ amount }] },
        }),
      });
      if (answer.kind === "unreachable" || answer.status >= 500) {
        return { kind: "unavailable" };
      }
      if (answer.status >= 200 && answer.status < 300) {
        const order = parsedOrder(answer.body);
        return order === null ? { kind: "unavailable" } : { kind: "created", ...order };
      }
      if (UNAVAILABLE_STATUSES.includes(answer.status)) {
        return { kind: "unavailable" };
      }
      return { kind: "refused" };
    },

    async readOrder(orderId: string): Promise<MercadoPagoOrderReading> {
      const answer = await call(`/v1/orders/${encodeURIComponent(orderId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${options.accessToken}` },
      });
      if (answer.kind === "unreachable" || answer.status < 200 || answer.status >= 300) {
        return { kind: "unavailable" };
      }
      const order = parsedOrder(answer.body);
      return order === null ? { kind: "unavailable" } : { kind: "read", result: order.result };
    },
  };
}
