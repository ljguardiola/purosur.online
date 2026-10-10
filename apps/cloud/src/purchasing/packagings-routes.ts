import {
  packagingCreationBodySchema,
  packagingEditBodySchema,
  packagingListSchema,
  packagingSummarySchema,
} from "@purosur/contracts";
import { PRODUCTS_PACKAGINGS_MAY_BE_DEFINED_FOR } from "@purosur/domain";
import {
  createPackaging,
  deactivatePackaging,
  editPackaging,
  findPackagingListing,
  listPackagings,
  reactivatePackaging,
} from "@purosur/domain/purchasing/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
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
import { DrizzlePurchasingListReader } from "./drizzle-purchasing-list-reader.js";
import { DrizzlePurchasingStore } from "./drizzle-purchasing-store.js";
import type { PurchasingRouteOptions } from "./purchasing-route-options.js";

const PRODUCT_NOT_FOUND_RESPONSE = {
  code: "product_not_found",
  message: "no product with that id",
} as const;
const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no purchase packaging with that id",
} as const;
const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "this purchase packaging was changed since it was loaded",
} as const;
const NAME_TAKEN_RESPONSE = {
  code: "packaging_name_taken",
  message: "the product already has a purchase packaging with that name",
} as const;
const PART_OF_A_UNIT_RESPONSE = {
  code: "validation_failed",
  message: "a product sold by the unit is packaged in whole units",
  details: [{ field: "quantityPerPackage" }],
} as const;
const ALREADY_INACTIVE_RESPONSE = {
  code: "packaging_already_inactive",
  message: "the purchase packaging is already deactivated",
} as const;
const ALREADY_ACTIVE_RESPONSE = {
  code: "packaging_already_active",
  message: "the purchase packaging is already active",
} as const;
const SALE_UNIT_CHANGED_RESPONSE = {
  code: "packaging_sale_unit_changed",
  message: "the product's sale unit changed since the packaging's quantity was stated",
} as const;

export function registerPackagingsRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PurchasingRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const store = new DrizzlePurchasingStore(options.db, now);
  const reader = new DrizzlePurchasingListReader(options.db);
  const catalog = new DrizzleCatalogListReader(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const config = { access: capabilityAccess("purchase_packagings"), sessionSource };
  const readGuard = { preHandler: sameOriginGuard(options.backofficeOrigin), config };
  const writeGuard = { preHandler: backofficeOriginGuard(options.backofficeOrigin), config };

  async function summaryOf(packagingId: string) {
    const listing = await findPackagingListing(reader, packagingId);
    if (!listing) {
      throw new Error("the purchase packaging vanished after it was written");
    }
    return packagingSummarySchema.parse(listing);
  }

  app.get("/purchase-packagings", readGuard, async (_request, reply) => {
    const [packagings, products] = await Promise.all([
      listPackagings(reader),
      catalog.products(PRODUCTS_PACKAGINGS_MAY_BE_DEFINED_FOR),
    ]);
    await reply.code(200).send(
      packagingListSchema.parse({
        packagings,
        products: products.map(({ id, name, saleUnit }) => ({ id, name, saleUnit })),
      }),
    );
  });

  app.post("/purchase-packagings", writeGuard, async (request, reply) => {
    const body = await readValidatedBody(reply, packagingCreationBodySchema, request.body);
    if (!body) {
      return;
    }

    const outcome = await createPackaging(store, {
      ...body,
      actorId: openSessionOf(request).userId,
    });

    if (outcome.kind === "product_not_found") {
      await reply.code(404).send(PRODUCT_NOT_FOUND_RESPONSE);
      return;
    }
    if (outcome.kind === "invalid_quantity") {
      await reply.code(400).send(PART_OF_A_UNIT_RESPONSE);
      return;
    }
    if (outcome.kind === "name_taken") {
      await reply.code(409).send(NAME_TAKEN_RESPONSE);
      return;
    }
    await reply.code(201).send(await summaryOf(outcome.packaging.id));
  });

  app.put("/purchase-packagings/:id", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id"]);
    if (!ids) {
      return;
    }
    const body = await readValidatedBody(reply, packagingEditBodySchema, request.body);
    if (!body) {
      return;
    }

    const outcome = await editPackaging(store, {
      ...body,
      id: ids.id,
      actorId: openSessionOf(request).userId,
    });

    if (outcome.kind === "not_found") {
      await reply.code(404).send(NOT_FOUND_RESPONSE);
      return;
    }
    if (outcome.kind === "stale_version") {
      await reply.code(409).send(STALE_VERSION_RESPONSE);
      return;
    }
    if (outcome.kind === "invalid_quantity") {
      await reply.code(400).send(PART_OF_A_UNIT_RESPONSE);
      return;
    }
    if (outcome.kind === "name_taken") {
      await reply.code(409).send(NAME_TAKEN_RESPONSE);
      return;
    }
    await reply.code(200).send(await summaryOf(outcome.packaging.id));
  });

  app.put("/purchase-packagings/:id/deactivation", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id"]);
    if (!ids) {
      return;
    }

    const outcome = await deactivatePackaging(store, {
      id: ids.id,
      actorId: openSessionOf(request).userId,
    });

    if (outcome.kind === "not_found") {
      await reply.code(404).send(NOT_FOUND_RESPONSE);
      return;
    }
    if (outcome.kind === "already_inactive") {
      await reply.code(409).send(ALREADY_INACTIVE_RESPONSE);
      return;
    }
    await reply.code(200).send();
  });

  app.delete("/purchase-packagings/:id/deactivation", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id"]);
    if (!ids) {
      return;
    }

    const outcome = await reactivatePackaging(store, {
      id: ids.id,
      actorId: openSessionOf(request).userId,
    });

    if (outcome.kind === "not_found") {
      await reply.code(404).send(NOT_FOUND_RESPONSE);
      return;
    }
    if (outcome.kind === "already_active") {
      await reply.code(409).send(ALREADY_ACTIVE_RESPONSE);
      return;
    }
    if (outcome.kind === "sale_unit_changed") {
      await reply.code(409).send(SALE_UNIT_CHANGED_RESPONSE);
      return;
    }
    await reply.code(200).send();
  });
}
