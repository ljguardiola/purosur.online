import {
  purchaseChangesSchema,
  purchaseChoicesSchema,
  purchaseHeaderCorrectionBodySchema,
  purchaseLineExpiryCorrectionBodySchema,
  purchaseLinesAdditionBodySchema,
  purchaseListSchema,
  purchaseRegistrationBodySchema,
  purchaseSummarySchema,
} from "@purosur/contracts";
import { PRODUCTS_PURCHASES_MAY_BE_REGISTERED_FOR } from "@purosur/domain";
import {
  addPurchaseLines,
  correctPurchaseHeader,
  correctPurchaseLineExpiry,
  findPurchaseListing,
  type ListedPurchase,
  listPurchaseChanges,
  listPurchaseChoices,
  listPurchases,
  type RegisterPurchaseOutcome,
  registerPurchase,
} from "@purosur/domain/purchasing/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply } from "fastify";
import { DrizzleCatalogListReader } from "../catalog/drizzle-catalog-list-reader.js";
import { readRecordIds } from "../platform/record-id-params.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { backofficeOriginGuard, sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzlePurchaseChangeReader } from "./drizzle-purchase-change-reader.js";
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

const UNCHANGED_MESSAGES = {
  purchase_unchanged: "the purchase already has these values",
  expiry_unchanged: "the line already has this expiry date",
} as const;

async function sendUnchanged(reply: FastifyReply, code: keyof typeof UNCHANGED_MESSAGES) {
  await reply.code(409).send({ code, message: UNCHANGED_MESSAGES[code] });
}

async function sendNotFound(reply: FastifyReply, code: "purchase_not_found" | "line_not_found") {
  await reply.code(404).send({
    code,
    message: code === "purchase_not_found" ? "no purchase with that id" : "no line with that id",
  });
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
  const ports = {
    store: new DrizzlePurchasingStore(options.db, now),
    clock: { now },
    zoneRules: options.zoneRules,
  };
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

  const changes = new DrizzlePurchaseChangeReader(options.db);

  async function sendPurchase(reply: FastifyReply, status: 200 | 201, purchaseId: string) {
    const purchase = await findPurchaseListing(reader, purchaseId);
    if (!purchase) {
      throw new Error("the purchase vanished after it was corrected");
    }
    await reply.code(status).send(summaryOf(purchase));
  }

  app.post("/purchases/:purchaseId/lines", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["purchaseId"]);
    if (!ids) {
      return;
    }
    const body = await readValidatedBody(reply, purchaseLinesAdditionBodySchema, request.body);
    if (!body) {
      return;
    }
    const openSession = openSessionOf(request);

    const outcome = await addPurchaseLines(ports, {
      ...body,
      purchaseId: ids.purchaseId,
      locationId: openSession.locationId,
      actorId: openSession.userId,
    });

    if (outcome.kind === "purchase_not_found") {
      await sendNotFound(reply, outcome.kind);
      return;
    }
    if (outcome.kind !== "added") {
      await sendRefusal(reply, outcome);
      return;
    }
    await sendPurchase(reply, 201, outcome.purchaseId);
  });

  app.patch("/purchases/:purchaseId", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["purchaseId"]);
    if (!ids) {
      return;
    }
    const body = await readValidatedBody(reply, purchaseHeaderCorrectionBodySchema, request.body);
    if (!body) {
      return;
    }
    const openSession = openSessionOf(request);

    const outcome = await correctPurchaseHeader(ports, {
      ...body,
      purchaseId: ids.purchaseId,
      locationId: openSession.locationId,
      actorId: openSession.userId,
    });

    if (outcome.kind === "purchase_not_found") {
      await sendNotFound(reply, outcome.kind);
      return;
    }
    if (outcome.kind === "date_in_future") {
      await sendRefusal(reply, outcome);
      return;
    }
    if (outcome.kind === "unchanged") {
      await sendUnchanged(reply, "purchase_unchanged");
      return;
    }
    await sendPurchase(reply, 200, ids.purchaseId);
  });

  app.patch("/purchases/:purchaseId/lines/:lineId/expiry", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["purchaseId", "lineId"]);
    if (!ids) {
      return;
    }
    const body = await readValidatedBody(
      reply,
      purchaseLineExpiryCorrectionBodySchema,
      request.body,
    );
    if (!body) {
      return;
    }
    const openSession = openSessionOf(request);

    const outcome = await correctPurchaseLineExpiry(ports, {
      ...ids,
      ...body,
      locationId: openSession.locationId,
      actorId: openSession.userId,
    });

    if (outcome.kind === "purchase_not_found" || outcome.kind === "line_not_found") {
      await sendNotFound(reply, outcome.kind);
      return;
    }
    if (outcome.kind === "unchanged") {
      await sendUnchanged(reply, "expiry_unchanged");
      return;
    }
    await sendPurchase(reply, 200, ids.purchaseId);
  });

  app.get("/purchases/:purchaseId/changes", readGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["purchaseId"]);
    if (!ids) {
      return;
    }

    const outcome = await listPurchaseChanges(changes, {
      purchaseId: ids.purchaseId,
      locationId: openSessionOf(request).locationId,
    });

    if (outcome.kind === "not_found") {
      await sendNotFound(reply, "purchase_not_found");
      return;
    }
    await reply.code(200).send(
      purchaseChangesSchema.parse(
        outcome.changes.map(({ id, actorId, actorName, correctedAt, change }) => ({
          id,
          actor: { id: actorId, name: actorName },
          correctedAt: correctedAt.toISOString(),
          change,
        })),
      ),
    );
  });

  const choicesGuard = {
    preHandler: sameOriginGuard(options.backofficeOrigin),
    config: { access: capabilityAccess("purchase_choices"), sessionSource },
  };

  app.get("/purchase-choices", choicesGuard, async (_request, reply) => {
    const [choices, products] = await Promise.all([
      listPurchaseChoices(reader, ports.clock, ports.zoneRules),
      catalog.products(PRODUCTS_PURCHASES_MAY_BE_REGISTERED_FOR),
    ]);
    await reply.code(200).send(
      purchaseChoicesSchema.parse({
        suppliers: choices.suppliers,
        products: products.map(({ id, name, brandName, netContent, saleUnit }) => ({
          id,
          name,
          brandName,
          netContent,
          saleUnit,
        })),
        today: choices.today,
      }),
    );
  });
}
