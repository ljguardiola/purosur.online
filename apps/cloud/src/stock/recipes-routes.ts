import { recipeListSchema, recipeSaveBodySchema, recipeSummarySchema } from "@purosur/contracts";
import { PRODUCTS_A_RECIPE_MAY_USE } from "@purosur/domain";
import {
  findRecipeListing,
  listRecipes,
  type RecipeListing,
  saveRecipe,
} from "@purosur/domain/stock/use-cases";
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
import { DrizzleRecipeListReader } from "./drizzle-recipe-list-reader.js";
import { DrizzleRecipeStore } from "./drizzle-recipe-store.js";
import type { StockRouteOptions } from "./stock-route-options.js";

const PRODUCT_NOT_FOUND_RESPONSE = {
  code: "product_not_found",
  message: "no active product with that id",
} as const;
const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "this recipe was changed since it was loaded",
} as const;

function recipeSummary(listing: RecipeListing) {
  return recipeSummarySchema.parse({ ...listing, lastBatch: null });
}

export function registerRecipesRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: StockRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const store = new DrizzleRecipeStore(options.db, now);
  const reader = new DrizzleRecipeListReader(options.db);
  const catalog = new DrizzleCatalogListReader(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const config = { access: capabilityAccess("recipes"), sessionSource };
  const readGuard = { preHandler: sameOriginGuard(options.backofficeOrigin), config };
  const writeGuard = { preHandler: backofficeOriginGuard(options.backofficeOrigin), config };

  app.get("/recipes", readGuard, async (_request, reply) => {
    const [recipes, usableProducts] = await Promise.all([
      listRecipes(reader),
      catalog.products(PRODUCTS_A_RECIPE_MAY_USE),
    ]);
    await reply.code(200).send(
      recipeListSchema.parse({
        recipes: recipes.map(recipeSummary),
        products: usableProducts.map(({ id, name, saleUnit }) => ({ id, name, saleUnit })),
      }),
    );
  });

  app.put("/recipes/:productId", writeGuard, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["productId"]);
    if (!ids) {
      return;
    }
    const body = await readValidatedBody(reply, recipeSaveBodySchema, request.body);
    if (!body) {
      return;
    }

    const outcome = await saveRecipe(store, {
      productId: ids.productId,
      components: body.components,
      version: body.version,
      actorId: openSessionOf(request).userId,
    });

    if (outcome.kind === "product_not_found") {
      await reply.code(404).send(PRODUCT_NOT_FOUND_RESPONSE);
      return;
    }
    if (outcome.kind === "stale_version") {
      await reply.code(409).send(STALE_VERSION_RESPONSE);
      return;
    }
    if (outcome.kind === "component_not_found") {
      await reply.code(400).send({
        code: "component_not_found",
        message: "a component is not an active product",
        componentProductId: outcome.componentProductId,
      });
      return;
    }
    if (outcome.kind === "invalid_recipe") {
      await reply.code(400).send({
        code: "invalid_recipe",
        message: "the recipe breaks one of the recipe rules",
        reason: outcome.reason,
      });
      return;
    }

    const saved = await findRecipeListing(reader, outcome.recipe.productId);
    if (!saved) {
      throw new Error("the recipe vanished after it was written");
    }
    await reply.code(200).send(recipeSummary(saved));
  });
}
