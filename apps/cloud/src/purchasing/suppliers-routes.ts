import {
  supplierCreationBodySchema,
  supplierEditBodySchema,
  supplierListSchema,
  supplierSummarySchema,
} from "@purosur/contracts";
import {
  createSupplier,
  deactivateSupplier,
  editSupplier,
  listSuppliers,
  reactivateSupplier,
} from "@purosur/domain/purchasing/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
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

const NOT_FOUND_RESPONSE = { code: "not_found", message: "no supplier with that id" } as const;
const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "this supplier was changed since it was loaded",
} as const;
const NAME_TAKEN_RESPONSE = {
  code: "supplier_name_taken",
  message: "a supplier with that name already exists",
} as const;
const CUIT_TAKEN_RESPONSE = {
  code: "supplier_cuit_taken",
  message: "a supplier with that CUIT already exists",
} as const;
const ALREADY_INACTIVE_RESPONSE = {
  code: "supplier_already_inactive",
  message: "the supplier is already deactivated",
} as const;
const ALREADY_ACTIVE_RESPONSE = {
  code: "supplier_already_active",
  message: "the supplier is already active",
} as const;

export function registerSuppliersRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PurchasingRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const store = new DrizzlePurchasingStore(options.db);
  const reader = new DrizzlePurchasingListReader(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const config = { access: capabilityAccess("suppliers"), sessionSource };
  const readGuard = { preHandler: sameOriginGuard(options.backofficeOrigin), config };
  const writeGuard = { preHandler: backofficeOriginGuard(options.backofficeOrigin), config };

  app.get("/suppliers", readGuard, async (_request, reply) => {
    await reply.code(200).send(supplierListSchema.parse(await listSuppliers(reader)));
  });

  app.post("/suppliers", writeGuard, async (request, reply) => {
    const body = await readValidatedBody(reply, supplierCreationBodySchema, request.body);
    if (!body) {
      return;
    }

    const outcome = await createSupplier(store, {
      ...body,
      actorId: openSessionOf(request).userId,
    });

    if (outcome.kind === "name_taken") {
      await reply.code(409).send(NAME_TAKEN_RESPONSE);
      return;
    }
    if (outcome.kind === "cuit_taken") {
      await reply.code(409).send(CUIT_TAKEN_RESPONSE);
      return;
    }
    await reply.code(201).send(supplierSummarySchema.parse(outcome.supplier));
  });

  app.put("/suppliers/:id", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id"]);
    if (!ids) {
      return;
    }
    const body = await readValidatedBody(reply, supplierEditBodySchema, request.body);
    if (!body) {
      return;
    }

    const outcome = await editSupplier(store, {
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
    if (outcome.kind === "name_taken") {
      await reply.code(409).send(NAME_TAKEN_RESPONSE);
      return;
    }
    if (outcome.kind === "cuit_taken") {
      await reply.code(409).send(CUIT_TAKEN_RESPONSE);
      return;
    }
    await reply.code(200).send(supplierSummarySchema.parse(outcome.supplier));
  });

  app.put("/suppliers/:id/deactivation", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id"]);
    if (!ids) {
      return;
    }

    const outcome = await deactivateSupplier(store, {
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

  app.delete("/suppliers/:id/deactivation", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id"]);
    if (!ids) {
      return;
    }

    const outcome = await reactivateSupplier(store, {
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
    await reply.code(200).send();
  });
}
