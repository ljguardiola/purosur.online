import {
  purchaseOrderReceiptBodySchema,
  purchaseOrderReceiptDraftSchema,
  purchaseOrderReceiptSchema,
} from "@purosur/contracts";
import {
  getPurchaseOrderReceiptDraft,
  receivePurchaseOrder,
} from "@purosur/domain/purchasing/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { backofficeOriginGuard, sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzlePurchaseOrderReader } from "./drizzle-purchase-order-reader.js";
import { DrizzlePurchaseOrderReceiptStore } from "./drizzle-purchase-order-receipt-store.js";
import { sendPurchaseOrderNotFound } from "./purchase-orders-routes.js";
import { sendPurchaseRefusal } from "./purchase-refusals.js";
import type { PurchasingRouteOptions } from "./purchasing-route-options.js";

async function sendNotReceivable(reply: FastifyReply): Promise<void> {
  await reply.code(409).send({
    code: "purchase_order_not_receivable",
    message: "only a sent or partially received purchase order can be received",
  });
}

export function registerPurchaseOrderReceiptsRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PurchasingRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const ports = {
    store: new DrizzlePurchaseOrderReceiptStore(options.db, now),
    clock: { now },
    zoneRules: options.zoneRules,
  };
  const reader = new DrizzlePurchaseOrderReader(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const config = { access: capabilityAccess("purchase_order_receipts"), sessionSource };

  app.post(
    "/purchase-orders/:id/receipts",
    { preHandler: backofficeOriginGuard(options.backofficeOrigin), config },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const body = await readValidatedBody(reply, purchaseOrderReceiptBodySchema, request.body);
      if (!body) {
        return;
      }
      const { locationId, userId } = openSessionOf(request);

      const outcome = await receivePurchaseOrder(ports, {
        ...body,
        orderId: ids.id,
        locationId,
        actorId: userId,
      });

      switch (outcome.kind) {
        case "received":
          await reply.code(201).send(
            purchaseOrderReceiptSchema.parse({
              purchaseId: outcome.purchaseId,
              state: outcome.state,
            }),
          );
          return;
        case "not_found":
          await sendPurchaseOrderNotFound(reply);
          return;
        case "not_receivable":
          await sendNotReceivable(reply);
          return;
        case "nothing_ordered_received":
          await reply.code(409).send({
            code: "nothing_ordered_received",
            message: "none of the received products was ordered",
          });
          return;
        default:
          await sendPurchaseRefusal(reply, outcome);
      }
    },
  );

  app.get(
    "/purchase-orders/:id/receipt-draft",
    { preHandler: sameOriginGuard(options.backofficeOrigin), config },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }

      const outcome = await getPurchaseOrderReceiptDraft(reader, {
        locationId: openSessionOf(request).locationId,
        orderId: ids.id,
      });

      if (outcome.kind === "not_found") {
        await sendPurchaseOrderNotFound(reply);
        return;
      }
      if (outcome.kind === "not_receivable") {
        await sendNotReceivable(reply);
        return;
      }
      await reply.code(200).send(purchaseOrderReceiptDraftSchema.parse(outcome.draft));
    },
  );
}
