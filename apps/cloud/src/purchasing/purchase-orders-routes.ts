import {
  purchaseOrderBuildBodySchema,
  purchaseOrderBuildResponseSchema,
  purchaseOrderDetailSchema,
  purchaseOrderEditBodySchema,
  purchaseOrderListQuerySchema,
  purchaseOrderListSchema,
} from "@purosur/contracts";
import {
  type BuildPurchaseOrdersOutcome,
  buildPurchaseOrders,
  type CancelPurchaseOrderOutcome,
  cancelPurchaseOrder,
  type EditPurchaseOrderOutcome,
  editPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  type SharePurchaseOrderOutcome,
  sharePurchaseOrder,
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
import { DrizzlePurchaseOrderStore } from "./drizzle-purchase-order-store.js";
import { purchaseOrderDocument } from "./purchase-order-document.js";
import { renderPurchaseOrderPdf } from "./purchase-order-pdf.js";
import { renderPurchaseOrderText } from "./purchase-order-text.js";
import type { PurchasingRouteOptions } from "./purchasing-route-options.js";

type Refusal =
  | Exclude<BuildPurchaseOrdersOutcome, { kind: "created" }>
  | Exclude<EditPurchaseOrderOutcome, { kind: "edited" }>
  | Exclude<CancelPurchaseOrderOutcome, { kind: "cancelled" }>
  | Exclude<SharePurchaseOrderOutcome, { kind: "shared" }>;

function invalid(reply: FastifyReply, message: string, field: string) {
  return reply.code(400).send({ code: "validation_failed", message, details: [{ field }] });
}

async function sendRefusal(reply: FastifyReply, refusal: Refusal): Promise<void> {
  switch (refusal.kind) {
    case "no_choices":
      await invalid(reply, "an order needs at least one choice", "choices");
      return;
    case "no_lines":
      await invalid(reply, "an order needs at least one line", "lines");
      return;
    case "invalid_package_count":
      await invalid(
        reply,
        "the packages do not make a quantity the product may be bought in",
        "packages",
      );
      return;
    case "invalid_quantity_per_package":
      await invalid(
        reply,
        "the quantity per package is not one the product may be bought in",
        "quantityPerPackage",
      );
      return;
    case "duplicate_product":
      await invalid(reply, "a product can appear only once", "productId");
      return;
    case "not_found":
      await reply
        .code(404)
        .send({ code: "purchase_order_not_found", message: "no purchase order with that id" });
      return;
    case "not_editable":
      await reply.code(409).send({
        code: "purchase_order_not_editable",
        message: "only a draft purchase order can be edited",
      });
      return;
    case "not_shareable":
      await reply.code(409).send({
        code: "purchase_order_not_shareable",
        message: "only a draft purchase order can be shared",
      });
      return;
    case "not_cancellable":
      await reply.code(409).send({
        code: "purchase_order_not_cancellable",
        message: "this purchase order can no longer be cancelled",
      });
      return;
    case "supplier_not_purchasable":
      await reply.code(409).send({
        code: "supplier_not_purchasable",
        message: "the supplier does not exist or is deactivated",
      });
      return;
    case "product_not_purchasable":
      await reply.code(409).send({
        code: "product_not_purchasable",
        message: "the product does not exist or is deactivated",
      });
      return;
    case "offer_unavailable":
      await reply.code(409).send({
        code: "offer_unavailable",
        message: "the supplier has no current offer for the product",
      });
      return;
  }
}

export function registerPurchaseOrdersRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PurchasingRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const store = new DrizzlePurchaseOrderStore(options.db);
  const reader = new DrizzlePurchaseOrderReader(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const config = { access: capabilityAccess("purchase_orders"), sessionSource };
  const readGuard = { preHandler: sameOriginGuard(options.backofficeOrigin), config };
  const writeGuard = { preHandler: backofficeOriginGuard(options.backofficeOrigin), config };

  async function sendOrder(reply: FastifyReply, locationId: string, orderId: string) {
    const found = await getPurchaseOrder(reader, { locationId, orderId });
    if (found.kind === "not_found") {
      await sendRefusal(reply, found);
      return;
    }
    await reply.code(200).send(
      purchaseOrderDetailSchema.parse({
        ...found.order,
        createdAt: found.order.createdAt.toISOString(),
      }),
    );
  }

  app.get("/purchase-orders", readGuard, async (request, reply) => {
    const query = await readValidatedBody(reply, purchaseOrderListQuerySchema, request.query);
    if (!query) {
      return;
    }
    const orders = await listPurchaseOrders(reader, {
      locationId: openSessionOf(request).locationId,
      ...(query.state === undefined ? {} : { state: query.state }),
    });
    await reply
      .code(200)
      .send(
        purchaseOrderListSchema.parse(
          orders.map((order) => ({ ...order, createdAt: order.createdAt.toISOString() })),
        ),
      );
  });

  app.get("/purchase-orders/:id", readGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id"]);
    if (!ids) {
      return;
    }
    await sendOrder(reply, openSessionOf(request).locationId, ids.id);
  });

  app.get("/purchase-orders/:id/document.pdf", readGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id"]);
    if (!ids) {
      return;
    }
    const found = await getPurchaseOrder(reader, {
      locationId: openSessionOf(request).locationId,
      orderId: ids.id,
    });
    if (found.kind === "not_found") {
      await sendRefusal(reply, found);
      return;
    }
    const pdf = await renderPurchaseOrderPdf(purchaseOrderDocument(found.order), now());
    await reply
      .header("Content-Disposition", "attachment")
      .type("application/pdf")
      .code(200)
      .send(pdf);
  });

  app.get("/purchase-orders/:id/document.txt", readGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id"]);
    if (!ids) {
      return;
    }
    const found = await getPurchaseOrder(reader, {
      locationId: openSessionOf(request).locationId,
      orderId: ids.id,
    });
    if (found.kind === "not_found") {
      await sendRefusal(reply, found);
      return;
    }
    await reply
      .type("text/plain; charset=utf-8")
      .code(200)
      .send(renderPurchaseOrderText(purchaseOrderDocument(found.order)));
  });

  app.post("/purchase-orders", writeGuard, async (request, reply) => {
    const body = await readValidatedBody(reply, purchaseOrderBuildBodySchema, request.body);
    if (!body) {
      return;
    }
    const openSession = openSessionOf(request);

    const outcome = await buildPurchaseOrders(
      { store, clock: { now } },
      { ...body, locationId: openSession.locationId, actorId: openSession.userId },
    );

    if (outcome.kind !== "created") {
      await sendRefusal(reply, outcome);
      return;
    }
    await reply
      .code(201)
      .send(purchaseOrderBuildResponseSchema.parse({ orderIds: outcome.orderIds }));
  });

  app.put("/purchase-orders/:id/lines", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id"]);
    if (!ids) {
      return;
    }
    const body = await readValidatedBody(reply, purchaseOrderEditBodySchema, request.body);
    if (!body) {
      return;
    }
    const { locationId } = openSessionOf(request);

    const outcome = await editPurchaseOrder({ store }, { ...body, locationId, orderId: ids.id });

    if (outcome.kind !== "edited") {
      await sendRefusal(reply, outcome);
      return;
    }
    await sendOrder(reply, locationId, ids.id);
  });

  app.post("/purchase-orders/:id/share", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id"]);
    if (!ids) {
      return;
    }
    const { locationId, userId } = openSessionOf(request);

    const outcome = await sharePurchaseOrder(
      { store, clock: { now } },
      { locationId, orderId: ids.id, actorId: userId },
    );

    if (outcome.kind !== "shared") {
      await sendRefusal(reply, outcome);
      return;
    }
    await sendOrder(reply, locationId, ids.id);
  });

  app.post("/purchase-orders/:id/cancel", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id"]);
    if (!ids) {
      return;
    }
    const { locationId, userId } = openSessionOf(request);

    const outcome = await cancelPurchaseOrder(
      { store, clock: { now } },
      { locationId, orderId: ids.id, actorId: userId },
    );

    if (outcome.kind !== "cancelled") {
      await sendRefusal(reply, outcome);
      return;
    }
    await sendOrder(reply, locationId, ids.id);
  });
}
