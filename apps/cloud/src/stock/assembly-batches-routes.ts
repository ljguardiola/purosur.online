import {
  type AssemblyBatchRefusal,
  assemblyBatchBodySchema,
  assemblyBatchListSchema,
  assemblyBatchPreviewQuerySchema,
  assemblyBatchPreviewSchema,
  assemblyBatchResultSchema,
} from "@purosur/contracts";
import {
  listAssemblyBatches,
  listRecipes,
  previewAssemblyBatch,
  registerAssemblyBatch,
} from "@purosur/domain/stock/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { backofficeOriginGuard, sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleAssemblyBatchReader } from "./drizzle-assembly-batch-reader.js";
import { DrizzleAssemblyBatchStore } from "./drizzle-assembly-batch-store.js";
import { DrizzleRecipeListReader } from "./drizzle-recipe-list-reader.js";
import { recipeSummary } from "./recipes-routes.js";
import { periodStart } from "./stock-period.js";
import type { StockRouteOptions } from "./stock-route-options.js";

const REFUSALS = {
  product_not_found: { status: 404, message: "no active product with that id" },
  component_not_found: { status: 400, message: "a component is not an active product" },
  no_recipe: { status: 404, message: "the product has no recipe" },
  stale_recipe: { status: 409, message: "the recipe was changed since it was loaded" },
  invalid_size: { status: 400, message: "the size is not a quantity the product can hold" },
  nothing_used: { status: 400, message: "a batch uses at least one component" },
  invalid_output: { status: 400, message: "the output is not a quantity the product can hold" },
  invalid_quantity: { status: 400, message: "a quantity is not valid for its component" },
} as const satisfies Record<AssemblyBatchRefusal["code"], { status: number; message: string }>;

async function refuse(
  reply: FastifyReply,
  refusal: { kind: AssemblyBatchRefusal["code"]; componentProductId?: string },
): Promise<void> {
  const { status, message } = REFUSALS[refusal.kind];
  await reply.code(status).send({
    code: refusal.kind,
    message,
    ...(refusal.componentProductId === undefined
      ? {}
      : { componentProductId: refusal.componentProductId }),
  });
}

export function registerAssemblyBatchesRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: StockRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const store = new DrizzleAssemblyBatchStore(options.db);
  const reader = new DrizzleAssemblyBatchReader(options.db);
  const recipes = new DrizzleRecipeListReader(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const config = { access: capabilityAccess("batches"), sessionSource };
  const readGuard = { preHandler: sameOriginGuard(options.backofficeOrigin), config };
  const writeGuard = { preHandler: backofficeOriginGuard(options.backofficeOrigin), config };

  app.get<{ Querystring: { days?: string } }>(
    "/assembly-batches",
    readGuard,
    async (request, reply) => {
      const { locationId } = openSessionOf(request);
      const [batches, recipeListings] = await Promise.all([
        listAssemblyBatches(reader, {
          locationId,
          from: periodStart(request.query.days, now()),
          to: now(),
        }),
        listRecipes(recipes, locationId),
      ]);
      await reply.code(200).send(
        assemblyBatchListSchema.parse({
          batches: batches.map((batch) => ({
            ...batch,
            assembledAt: batch.assembledAt.toISOString(),
          })),
          recipes: recipeListings.map(recipeSummary),
        }),
      );
    },
  );

  app.get("/assembly-batches/preview", readGuard, async (request, reply) => {
    const query = await readValidatedBody(reply, assemblyBatchPreviewQuerySchema, request.query);
    if (!query) {
      return;
    }
    const outcome = await previewAssemblyBatch(
      { recipes, lots: reader },
      { ...query, locationId: openSessionOf(request).locationId },
    );
    if (outcome.kind !== "previewed") {
      await refuse(reply, outcome);
      return;
    }
    const { kind: _kind, ...preview } = outcome;
    await reply.code(200).send(assemblyBatchPreviewSchema.parse(preview));
  });

  app.post("/assembly-batches", writeGuard, async (request, reply) => {
    const body = await readValidatedBody(reply, assemblyBatchBodySchema, request.body);
    if (!body) {
      return;
    }
    const session = openSessionOf(request);
    const outcome = await registerAssemblyBatch(
      { store, clock: { now } },
      { ...body, locationId: session.locationId, actorId: session.userId },
    );
    if (outcome.kind !== "recorded") {
      await refuse(reply, outcome);
      return;
    }
    const { id, productId, assembledAt, output, unitCostCents, costIncomplete, expiresOn } =
      outcome.batch;
    await reply.code(200).send(
      assemblyBatchResultSchema.parse({
        batch: {
          id,
          productId,
          assembledAt: assembledAt.toISOString(),
          output,
          unitCostCents,
          costIncomplete,
          expiresOn,
        },
      }),
    );
  });
}
