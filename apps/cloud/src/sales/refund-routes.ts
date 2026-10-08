import { markedRefundDoneSchema, pendingRefundsSchema } from "@purosur/contracts";
import { listPendingRefunds, markRefundDone } from "@purosur/domain/sales/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard, sameOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { readRecordIds } from "../platform/record-id-params.js";
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
        { reader },
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
            amount: refund.amount,
            occurred_at: refund.occurredAt.toISOString(),
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
}
