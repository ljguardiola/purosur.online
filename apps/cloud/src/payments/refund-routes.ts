import {
  confirmedRefundSchema,
  discardedRefundSchema,
  markedRefundDoneSchema,
  pendingRefundsSchema,
} from "@purosur/contracts";
import {
  confirmMercadoPagoRefund,
  discardRefund,
  listPendingRefunds,
  type MercadoPagoOrders,
  markRefundDone,
} from "@purosur/domain/payments/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { readRecordIds } from "../platform/record-id-params.js";
import { backofficeOriginGuard, sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleMercadoPagoRefundStore } from "./drizzle-mercado-pago-refund-store.js";
import { DrizzlePaymentTransactionLanes } from "./drizzle-payment-transaction-lanes.js";
import { DrizzlePendingRefundsReader } from "./drizzle-pending-refunds-reader.js";
import { DrizzleRefundStore } from "./drizzle-refund-store.js";
import { randomMercadoPagoRefundKeys } from "./mercado-pago-refund-keys.js";

const REFUND_NOT_FOUND_RESPONSE = {
  code: "refund_not_found",
  message: "this refund does not exist",
} as const;

const ALREADY_DONE_RESPONSE = {
  code: "already_done",
  message: "this refund was already marked as done",
} as const;

const REFUND_DISCARDED_RESPONSE = {
  code: "refund_discarded",
  message: "this refund was discarded",
} as const;

const REFUND_NOT_DISCARDABLE_RESPONSE = {
  code: "refund_not_discardable",
  message: "only the refund of a late payment can be discarded",
} as const;

const ALREADY_DISCARDED_RESPONSE = {
  code: "already_discarded",
  message: "this refund was already discarded",
} as const;

const REFUND_SENT_BY_CLOUD_RESPONSE = {
  code: "refund_sent_by_cloud",
  message: "this refund is sent to Mercado Pago by the system, not carried out by hand",
} as const;

const REFUND_NOT_CONFIRMABLE_RESPONSE = {
  code: "refund_not_confirmable",
  message: "only the refund of a QR payment of a cancelled sale can be confirmed",
} as const;

const ALREADY_CONFIRMED_RESPONSE = {
  code: "already_confirmed",
  message: "this refund was already confirmed",
} as const;

const REFUND_NOT_BACKED_RESPONSE = {
  code: "refund_not_backed",
  message: "the cancellation that justifies this refund is not recorded",
} as const;

const EXCEEDS_REFUNDABLE_RESPONSE = {
  code: "exceeds_refundable",
  message: "this refund is more than what is left to refund of the payment",
} as const;

const PROVIDER_NOT_CONFIGURED_RESPONSE = {
  code: "payment_provider_not_configured",
  message: "the payment provider is not configured",
} as const;

export interface RefundRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
  sending?: {
    connections: DedicatedConnections<TQueryResult>;
    mercadoPago: MercadoPagoOrders;
  };
}

export function registerRefundRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RefundRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzlePendingRefundsReader(options.db);
  const store = new DrizzleRefundStore(options.db);
  const config = { access: capabilityAccess("refunds_area"), sessionSource };

  app.get(
    "/refunds/pending",
    { preHandler: sameOriginGuard(options.backofficeOrigin), config },
    async (request, reply) => {
      const refunds = await listPendingRefunds(
        { reader, clock: { now } },
        { locationId: openSessionOf(request).locationId },
      );
      await reply.code(200).send(
        pendingRefundsSchema.parse({
          refunds: refunds.map((refund) => ({
            id: refund.id,
            sale_id: refund.saleId,
            register_id: refund.registerId,
            register_name: refund.registerName,
            method: refund.method,
            origin: refund.origin,
            discardable: refund.discardable,
            amount: refund.amount,
            occurred_at: refund.occurredAt.toISOString(),
            seconds_pending: refund.secondsPending,
            sale_occurred_at: refund.saleOccurredAt.toISOString(),
            covered_by: refund.coveredBy,
            provider_order_id: refund.providerOrderId,
            cancelled_by: refund.cancelledBy,
            cancelled_by_name: refund.cancelledByName,
            sent_by_cloud: refund.sentByCloud,
            delivery_stage: refund.deliveryStage,
            last_refusal_reason: refund.lastRefusalReason,
          })),
        }),
      );
    },
  );

  app.post(
    "/refunds/:id/completion",
    { preHandler: backofficeOriginGuard(options.backofficeOrigin), config },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const { locationId, userId } = openSessionOf(request);
      const outcome = await markRefundDone(
        { store, clock: { now } },
        { refundId: ids.id, locationId, actorId: userId },
      );
      if (outcome.kind === "not_found") {
        await reply.code(404).send(REFUND_NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "discarded") {
        await reply.code(409).send(REFUND_DISCARDED_RESPONSE);
        return;
      }
      if (outcome.kind === "already_done") {
        await reply.code(409).send(ALREADY_DONE_RESPONSE);
        return;
      }
      if (outcome.kind === "sent_by_cloud") {
        await reply.code(409).send(REFUND_SENT_BY_CLOUD_RESPONSE);
        return;
      }
      await reply.code(200).send(
        markedRefundDoneSchema.parse({
          refund_id: outcome.refundId,
          done_at: outcome.doneAt.toISOString(),
        }),
      );
    },
  );

  app.post(
    "/refunds/:id/confirmation",
    { preHandler: backofficeOriginGuard(options.backofficeOrigin), config },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const { sending } = options;
      if (!sending) {
        await reply.code(503).send(PROVIDER_NOT_CONFIGURED_RESPONSE);
        return;
      }
      const { locationId, userId } = openSessionOf(request);
      const outcome = await confirmMercadoPagoRefund(
        {
          store: new DrizzleMercadoPagoRefundStore(options.db),
          lanes: new DrizzlePaymentTransactionLanes(sending.connections),
          mercadoPago: sending.mercadoPago,
          refundKeys: randomMercadoPagoRefundKeys,
          clock: { now },
        },
        { refundId: ids.id, locationId, actorId: userId },
      );
      switch (outcome.kind) {
        case "not_found":
          await reply.code(404).send(REFUND_NOT_FOUND_RESPONSE);
          return;
        case "not_confirmable":
          await reply.code(409).send(REFUND_NOT_CONFIRMABLE_RESPONSE);
          return;
        case "already_done":
          await reply.code(409).send(ALREADY_DONE_RESPONSE);
          return;
        case "already_confirmed":
          await reply.code(409).send(ALREADY_CONFIRMED_RESPONSE);
          return;
        case "refund_not_backed":
          await reply.code(409).send(REFUND_NOT_BACKED_RESPONSE);
          return;
        case "exceeds_refundable":
          await reply.code(409).send(EXCEEDS_REFUNDABLE_RESPONSE);
          return;
        case "done":
          await reply.code(200).send(
            confirmedRefundSchema.parse({
              refund_id: outcome.refundId,
              outcome: "done",
              done_at: outcome.doneAt.toISOString(),
            }),
          );
          return;
        case "refused":
          await reply.code(200).send(
            confirmedRefundSchema.parse({
              refund_id: outcome.refundId,
              outcome: "refused",
              reason: outcome.reason,
            }),
          );
          return;
        case "sent":
        case "insufficient_balance":
        case "provider_unavailable":
          await reply
            .code(200)
            .send(
              confirmedRefundSchema.parse({ refund_id: outcome.refundId, outcome: outcome.kind }),
            );
          return;
      }
    },
  );

  app.post(
    "/refunds/:id/discard",
    { preHandler: backofficeOriginGuard(options.backofficeOrigin), config },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const { locationId, userId } = openSessionOf(request);
      const outcome = await discardRefund(
        { store, clock: { now } },
        { refundId: ids.id, locationId, actorId: userId },
      );
      if (outcome.kind === "not_found") {
        await reply.code(404).send(REFUND_NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "not_discardable") {
        await reply.code(409).send(REFUND_NOT_DISCARDABLE_RESPONSE);
        return;
      }
      if (outcome.kind === "already_done") {
        await reply.code(409).send(ALREADY_DONE_RESPONSE);
        return;
      }
      if (outcome.kind === "already_discarded") {
        await reply.code(409).send(ALREADY_DISCARDED_RESPONSE);
        return;
      }
      await reply.code(200).send(
        discardedRefundSchema.parse({
          refund_id: outcome.refundId,
          discarded_at: outcome.discardedAt.toISOString(),
        }),
      );
    },
  );
}
