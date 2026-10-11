import {
  discardedRefundSchema,
  markedRefundDoneSchema,
  pendingRefundsSchema,
} from "@purosur/contracts";
import {
  discardRefund,
  listPendingRefunds,
  markRefundDone,
} from "@purosur/domain/payments/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
import { backofficeOriginGuard, sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzlePendingRefundsReader } from "./drizzle-pending-refunds-reader.js";
import { DrizzleRefundStore } from "./drizzle-refund-store.js";

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

export interface RefundRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
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
            cancelled_by: refund.cancelledBy,
            cancelled_by_name: refund.cancelledByName,
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
      await reply.code(200).send(
        markedRefundDoneSchema.parse({
          refund_id: outcome.refundId,
          done_at: outcome.doneAt.toISOString(),
        }),
      );
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
