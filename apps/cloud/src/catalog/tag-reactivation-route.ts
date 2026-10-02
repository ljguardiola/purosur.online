import { reactivateTag } from "@purosur/domain/catalog/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";
import { TAG_NOT_FOUND_RESPONSE } from "./tag-edit-route.js";
import type { TagsRouteOptions } from "./tags-list-route.js";

const ALREADY_ACTIVE_RESPONSE = {
  code: "tag_already_active",
  message: "the tag is already active",
} as const;

export function registerTagReactivationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: TagsRouteOptions<TQueryResult>,
): void {
  registerRouteAccess(app);
  const catalogStore = new DrizzleCatalogStore(options.db);
  const now = options.now ?? (() => new Date());
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.delete<{ Params: { id: string } }>(
    "/tags/:id/deactivation",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("products_and_categories"), sessionSource },
    },
    async (request, reply) => {
      const targetId = request.params.id;
      if (!UUID_PATTERN.test(targetId)) {
        await reply.code(404).send(TAG_NOT_FOUND_RESPONSE);
        return;
      }

      const outcome = await reactivateTag(catalogStore, targetId);

      if (outcome.kind === "not_found") {
        await reply.code(404).send(TAG_NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "already_active") {
        await reply.code(409).send(ALREADY_ACTIVE_RESPONSE);
        return;
      }

      await reply.code(200).send();
    },
  );
}
