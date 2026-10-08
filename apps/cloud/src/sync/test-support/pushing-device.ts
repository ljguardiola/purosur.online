import { randomUUID } from "node:crypto";
import { canonicalOutboxEvent, type JsonValue } from "@purosur/domain";
import type { FastifyInstance } from "fastify";
import { hmacEventChain } from "../hmac-event-chain.js";

export const PUSHING_CHAIN_KEY = Buffer.alloc(32, 3).toString("base64");

const CASHIER = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";

export interface PushedEventDraft {
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  schema_version: number;
  payload: { [member: string]: JsonValue };
  occurred_at: string;
}

export function pushingDevice(app: FastifyInstance, deviceToken: string) {
  let lastSeq = 0;
  let link: string | null = null;
  return {
    async push(drafts: PushedEventDraft[]) {
      const events = drafts.map((draft) => {
        lastSeq += 1;
        const unlinked = {
          event_id: randomUUID(),
          device_seq: lastSeq,
          actor_id: CASHIER,
          ...draft,
        };
        link = hmacEventChain.link(PUSHING_CHAIN_KEY, link, canonicalOutboxEvent(unlinked));
        return { ...unlinked, chain_hmac: link };
      });
      const response = await app.inject({
        method: "POST",
        url: "/events",
        headers: { authorization: `Bearer ${deviceToken}` },
        payload: {
          app_version: "1.4.0",
          telemetry: { wal_size_bytes: 4096, disk_free_bytes: 50_000_000, disk_free_ratio: 0.42 },
          events,
        },
      });
      if (response.statusCode !== 200 || response.json().status !== "ok") {
        throw new Error(`test setup: the push was not received: ${response.body}`);
      }
    },
  };
}

export function cashSessionOpened(sessionId: string, openedAt: string): PushedEventDraft {
  return {
    aggregate_type: "CashSession",
    aggregate_id: sessionId,
    event_type: "cash_session_opened",
    schema_version: 1,
    payload: { opened_by: CASHIER, opened_at: openedAt, opening_float: 10000 },
    occurred_at: openedAt,
  };
}

export function cashSessionClosed(sessionId: string, closedAt: string): PushedEventDraft {
  return {
    aggregate_type: "CashSession",
    aggregate_id: sessionId,
    event_type: "cash_session_closed",
    schema_version: 1,
    payload: {
      closed_by: CASHIER,
      closed_at: closedAt,
      expected_cash: 9900,
      counted_cash: 9900,
      difference: 0,
    },
    occurred_at: closedAt,
  };
}

export function saleCompleted(options: {
  saleId: string;
  sessionId: string;
  completedAt: string;
  total: number;
  payments: { amount: number }[];
  line?: { productId: string; priceListId: string; listUnitPrice: number };
}): PushedEventDraft {
  const { line } = options;
  return {
    aggregate_type: "Sale",
    aggregate_id: options.saleId,
    event_type: "sale_completed",
    schema_version: 2,
    occurred_at: options.completedAt,
    payload: {
      id: options.saleId,
      register_id: randomUUID(),
      device_id: randomUUID(),
      session_id: options.sessionId,
      actor_id: CASHIER,
      occurred_at: options.completedAt,
      total: options.total,
      lines: line
        ? [
            {
              id: randomUUID(),
              product_id: line.productId,
              product_name: "Miel pura de abeja 1 kg",
              quantity: 1,
              list_unit_price: line.listUnitPrice,
              price_list_id: line.priceListId,
              promotion_id: null,
              discount_amount: 0,
              promotions: [],
              line_total: options.total,
            },
          ]
        : [],
      cash_movements: [],
      payments: options.payments.map(({ amount }) => ({
        id: randomUUID(),
        kind: "SALE",
        method: "CASH",
        provider: "NONE",
        amount,
        tendered: amount,
        state: "APPROVED",
        occurred_at: options.completedAt,
        authorized_by: null,
        confirmed_at: null,
      })),
    },
  };
}

export function saleCancelled(options: {
  saleId: string;
  sessionId: string;
  cancelledAt: string;
  paymentAmount: number;
  refundAmount: number;
}): PushedEventDraft {
  const paymentId = randomUUID();
  return {
    aggregate_type: "Sale",
    aggregate_id: options.saleId,
    event_type: "sale_cancelled",
    schema_version: 1,
    occurred_at: options.cancelledAt,
    payload: {
      id: options.saleId,
      register_id: randomUUID(),
      device_id: randomUUID(),
      session_id: options.sessionId,
      actor_id: CASHIER,
      authorized_by: null,
      occurred_at: options.cancelledAt,
      total: 4800,
      lines: [],
      cash_movements: [],
      payments: [
        {
          id: paymentId,
          kind: "SALE",
          method: "CASH",
          provider: "NONE",
          amount: options.paymentAmount,
          tendered: options.paymentAmount,
          state: "APPROVED",
          occurred_at: options.cancelledAt,
          authorized_by: null,
          confirmed_at: null,
        },
      ],
      refunds: [
        {
          id: randomUUID(),
          kind: "REFUND",
          parent_id: paymentId,
          method: "CASH",
          provider: "NONE",
          amount: options.refundAmount,
          state: "APPROVED",
          occurred_at: options.cancelledAt,
        },
      ],
    },
  };
}
