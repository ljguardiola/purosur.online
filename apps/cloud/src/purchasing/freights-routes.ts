import {
  freightBodySchema,
  freightListQuerySchema,
  freightListSchema,
  freightSchema,
  linkablePurchaseListSchema,
  linkablePurchasesQuerySchema,
} from "@purosur/contracts";
import { freightPeriodStart } from "@purosur/domain";
import {
  type EditFreightOutcome,
  editFreight,
  type Freight,
  listFreights,
  listLinkablePurchases,
  type RecordFreightOutcome,
  recordFreight,
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
import { DrizzleFreightListReader } from "./drizzle-freight-list-reader.js";
import { DrizzleFreightStore } from "./drizzle-freight-store.js";
import type { PurchasingRouteOptions } from "./purchasing-route-options.js";

type Refusal = Exclude<RecordFreightOutcome | EditFreightOutcome, { kind: "recorded" | "edited" }>;

const REFUSED_INPUT = {
  no_purchases: { field: "purchaseIds", message: "a freight needs at least one purchase" },
  invalid_amount: { field: "amountCents", message: "a freight's amount must be positive" },
  date_in_future: { field: "date", message: "a freight cannot be dated in the future" },
  invalid_description: { field: "description", message: "a freight needs a description" },
  invalid_means: { field: "means", message: "the freight's means are not valid" },
} as const;

function freightBody(freight: Freight) {
  return freightSchema.parse({
    id: freight.id,
    date: freight.date,
    amountCents: freight.amountCents,
    description: freight.description,
    means: freight.means,
    purchaseIds: freight.purchaseIds,
    recordedAt: freight.recordedAt.toISOString(),
  });
}

async function sendRefusal(reply: FastifyReply, refusal: Refusal): Promise<void> {
  switch (refusal.kind) {
    case "purchase_not_found":
      await reply.code(404).send({
        code: "purchase_not_found",
        message: "a purchase is not one of this branch's",
        details: [{ field: "purchaseIds" }],
      });
      return;
    case "purchases_without_value":
      await reply.code(409).send({
        code: "purchases_without_value",
        message: "the purchases are worth nothing to distribute the freight over",
      });
      return;
    case "freight_not_found":
      await reply
        .code(404)
        .send({ code: "freight_not_found", message: "no freight of this branch with that id" });
      return;
    default: {
      const { field, message } = REFUSED_INPUT[refusal.kind];
      await reply.code(400).send({ code: "validation_failed", message, details: [{ field }] });
    }
  }
}

export function registerFreightsRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PurchasingRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const ports = { store: new DrizzleFreightStore(options.db, now), clock: { now } };
  const reader = new DrizzleFreightListReader(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const config = { access: capabilityAccess("freights"), sessionSource };
  const readGuard = { preHandler: sameOriginGuard(options.backofficeOrigin), config };
  const writeGuard = { preHandler: backofficeOriginGuard(options.backofficeOrigin), config };

  app.get("/freights", readGuard, async (request, reply) => {
    const query = await readValidatedBody(reply, freightListQuerySchema, request.query);
    if (!query) {
      return;
    }
    const listed = await listFreights(reader, {
      locationId: openSessionOf(request).locationId,
      from: freightPeriodStart(query.period, now()),
      ...(query.search === undefined ? {} : { search: query.search }),
    });
    await reply.code(200).send(freightListSchema.parse(listed));
  });

  app.get("/freights/linkable-purchases", readGuard, async (request, reply) => {
    const query = await readValidatedBody(reply, linkablePurchasesQuerySchema, request.query);
    if (!query) {
      return;
    }
    const purchases = await listLinkablePurchases(reader, {
      locationId: openSessionOf(request).locationId,
      since: freightPeriodStart(query.period, now()),
      ...(query.freightId === undefined ? {} : { freightId: query.freightId }),
    });
    await reply.code(200).send(linkablePurchaseListSchema.parse(purchases));
  });

  app.post("/freights", writeGuard, async (request, reply) => {
    const body = await readValidatedBody(reply, freightBodySchema, request.body);
    if (!body) {
      return;
    }
    const openSession = openSessionOf(request);

    const outcome = await recordFreight(ports, {
      ...body,
      locationId: openSession.locationId,
      actorId: openSession.userId,
    });

    if (outcome.kind !== "recorded") {
      await sendRefusal(reply, outcome);
      return;
    }
    await reply.code(201).send(freightBody(outcome.freight));
  });

  app.put("/freights/:id", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id"]);
    if (!ids) {
      return;
    }
    const body = await readValidatedBody(reply, freightBodySchema, request.body);
    if (!body) {
      return;
    }
    const openSession = openSessionOf(request);

    const outcome = await editFreight(ports, {
      ...body,
      freightId: ids.id,
      locationId: openSession.locationId,
      actorId: openSession.userId,
    });

    if (outcome.kind !== "edited") {
      await sendRefusal(reply, outcome);
      return;
    }
    await reply.code(200).send(freightBody(outcome.freight));
  });
}
