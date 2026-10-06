import { deactivateTag } from "@purosur/domain/catalog/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { readRecordIds } from "../platform/record-id-params.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";
import { TAG_NOT_FOUND_RESPONSE } from "./tag-edit-route.js";
import type { TagsRouteOptions } from "./tags-list-route.js";

const ALREADY_INACTIVE_RESPONSE = {
  code: "tag_already_inactive",
  message: "the tag is already deactivated",
} as const;

export function registerTagDeactivationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: TagsRouteOptions<TQueryResult>,
): void {
  registerRouteAccess(app);
  const catalogStore = new DrizzleCatalogStore(options.db);
  const { now } = options;
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.put(
    "/tags/:id/deactivation",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("products_and_categories"), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const targetId = ids.id;
      const outcome = await deactivateTag(catalogStore, targetId);

      if (outcome.kind === "not_found") {
        await reply.code(404).send(TAG_NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "already_inactive") {
        await reply.code(409).send(ALREADY_INACTIVE_RESPONSE);
        return;
      }

      await reply.code(200).send();
    },
  );
}
