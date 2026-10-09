import { tagCreationBodySchema, tagSummarySchema } from "@purosur/contracts";
import { createTag } from "@purosur/domain/catalog/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { backofficeOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";
import type { TagsRouteOptions } from "./tags-list-route.js";

export const TAG_NAME_TAKEN_RESPONSE = {
  code: "tag_name_taken",
  message: "a tag with that name already exists",
} as const;

export function registerTagCreationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: TagsRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const catalogStore = new DrizzleCatalogStore(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.post(
    "/tags",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: {
        access: capabilityAccess("products_and_categories"),
        sessionSource,
      },
    },
    async (request, reply) => {
      const parsedBody = await readValidatedBody(reply, tagCreationBodySchema, request.body);
      if (!parsedBody) {
        return;
      }

      const outcome = await createTag(catalogStore, parsedBody);

      if (outcome.kind === "name_taken") {
        await reply.code(409).send(TAG_NAME_TAKEN_RESPONSE);
        return;
      }

      await reply.code(201).send(tagSummarySchema.parse({ ...outcome.tag, productCount: 0 }));
    },
  );
}
