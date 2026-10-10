import {
  purchaseChoicesSchema,
  purchaseListSchema,
  purchaseRegistrationBodySchema,
  purchaseSummarySchema,
} from "@purosur/contracts";
import { PRODUCTS_PURCHASES_MAY_BE_REGISTERED_FOR } from "@purosur/domain";
import {
  findPurchaseListing,
  type ListedPurchase,
  listPurchaseChoices,
  listPurchases,
  type RegisterPurchaseOutcome,
  registerPurchase,
} from "@purosur/domain/purchasing/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply } from "fastify";
import { DrizzleCatalogListReader } from "../catalog/drizzle-catalog-list-reader.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { backofficeOriginGuard, sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzlePurchasingListReader } from "./drizzle-purchasing-list-reader.js";
import { DrizzlePurchasingStore } from "./drizzle-purchasing-store.js";
import type { PurchasingRouteOptions } from "./purchasing-route-options.js";

type Refusal = Exclude<RegisterPurchaseOutcome, { kind: "registered" }>;

function summaryOf(purchase: ListedPurchase) {
  return purchaseSummarySchema.parse({
    ...purchase,
    recordedAt: purchase.recordedAt.toISOString(),
  });
}

function lineDetails(lineIndex: number) {
  return [{ field: "lines", lineIndex }];
}

async function sendRefusal(reply: FastifyReply, refusal: Refusal): Promise<void> {
  switch (refusal.kind) {
    case "no_lines":
      await reply.code(400).send({
        code: "validation_failed",
        message: "a purchase needs at least one line",
        details: [{ field: "lines" }],
      });
      return;
    case "date_in_future":
      await reply.code(400).send({
        code: "validation_failed",
        message: "a purchase cannot be dated in the future",
        details: [{ field: "purchasedOn" }],
      });
      return;
    case "supplier_not_found":
      await reply
        .code(404)
        .send({ code: "supplier_not_found", message: "no supplier with that id" });
      return;
    case "supplier_inactive":
      await reply
        .code(409)
        .send({ code: "supplier_inactive", message: "the supplier is deactivated" });
      return;
    case "product_not_found":
      await reply.code(404).send({
        code: "product_not_found",
        message: "no product with that id",
        details: lineDetails(refusal.lineIndex),
      });
      return;
    case "product_inactive":
      await reply.code(409).send({
        code: "product_inactive",
        message: "the product is deactivated",
        details: lineDetails(refusal.lineIndex),
      });
      return;
    case "packaging_not_found":
      await reply.code(404).send({
        code: "packaging_not_found",
        message: "no purchase packaging of that product with that id",
        details: lineDetails(refusal.lineIndex),
      });
      return;
    case "packaging_inactive":
      await reply.code(409).send({
        code: "packaging_inactive",
        message: "the purchase packaging is deactivated",
        details: lineDetails(refusal.lineIndex),
      });
      return;
    case "packaging_sale_unit_changed":
      await reply.code(409).send({
        code: "packaging_sale_unit_changed",
        message: "the product's sale unit changed since the packaging's quantity was stated",
        details: lineDetails(refusal.lineIndex),
      });
      return;
    case "invalid_quantity":
      await reply.code(400).send({
        code: "validation_failed",
        message: "the line's quantity is not one its product may be received in",
        details: lineDetails(refusal.lineIndex),
      });
      return;
  }
}

export function registerPurchasesRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PurchasingRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const ports = { store: new DrizzlePurchasingStore(options.db, now), clock: { now } };
  const reader = new DrizzlePurchasingListReader(options.db);
  const catalog = new DrizzleCatalogListReader(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const config = { access: capabilityAccess("purchases"), sessionSource };
  const readGuard = { preHandler: sameOriginGuard(options.backofficeOrigin), config };
  const writeGuard = { preHandler: backofficeOriginGuard(options.backofficeOrigin), config };

  app.get("/purchases", readGuard, async (request, reply) => {
    const purchases = await listPurchases(reader, openSessionOf(request).locationId);
    await reply.code(200).send(purchaseListSchema.parse(purchases.map(summaryOf)));
  });

  app.post("/purchases", writeGuard, async (request, reply) => {
    const body = await readValidatedBody(reply, purchaseRegistrationBodySchema, request.body);
    if (!body) {
      return;
    }
    const openSession = openSessionOf(request);

    const outcome = await registerPurchase(ports, {
      ...body,
      locationId: openSession.locationId,
      actorId: openSession.userId,
    });

    if (outcome.kind !== "registered") {
      await sendRefusal(reply, outcome);
      return;
    }
    const purchase = await findPurchaseListing(reader, outcome.purchase.id);
    if (!purchase) {
      throw new Error("the purchase vanished after it was registered");
    }
    await reply.code(201).send(summaryOf(purchase));
  });

  app.get("/purchase-choices", readGuard, async (_request, reply) => {
    const [choices, products] = await Promise.all([
      listPurchaseChoices(reader),
      catalog.products(PRODUCTS_PURCHASES_MAY_BE_REGISTERED_FOR),
    ]);
    await reply.code(200).send(
      purchaseChoicesSchema.parse({
        suppliers: choices.suppliers,
        products: products.map(({ id, name, saleUnit }) => ({ id, name, saleUnit })),
        packagings: choices.packagings,
      }),
    );
  });
}
