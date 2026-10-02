import { tagEditBodySchema, tagSummarySchema } from "@purosur/contracts";
import { editTag, findTagSummary } from "@purosur/domain/catalog/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { tags } from "../platform/db/schema.js";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { DrizzleCatalogListReader } from "./drizzle-catalog-list-reader.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";
import { TAG_NAME_TAKEN_RESPONSE } from "./tag-creation-route.js";
import type { TagsRouteOptions } from "./tags-list-route.js";

export const TAG_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no tag with that id",
} as const;

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "this tag was changed since it was loaded",
} as const;

async function findTagById<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  id: string,
): Promise<{ id: string } | undefined> {
  if (!UUID_PATTERN.test(id)) {
    return undefined;
  }
  const [tag] = await db.select({ id: tags.id }).from(tags).where(eq(tags.id, id));
  return tag;
}

export function registerTagEditRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: TagsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const catalogStore = new DrizzleCatalogStore(options.db);
  const catalog = new DrizzleCatalogListReader(options.db);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.put<{ Params: { id: string } }>(
    "/tags/:id",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: {
        access: capabilityAccess("products_and_categories"),
        sessionSource,
      },
    },
    async (request, reply) => {
      const target = await findTagById(options.db, request.params.id);
      if (!target) {
        await reply.code(404).send(TAG_NOT_FOUND_RESPONSE);
        return;
      }

      const parsedBody = await readValidatedBody(reply, tagEditBodySchema, request.body);
      if (!parsedBody) {
        return;
      }

      const outcome = await editTag(catalogStore, { id: target.id, ...parsedBody });

      if (outcome.kind === "stale_version") {
        await reply.code(409).send(STALE_VERSION_RESPONSE);
        return;
      }
      if (outcome.kind === "name_taken") {
        await reply.code(409).send(TAG_NAME_TAKEN_RESPONSE);
        return;
      }

      const listed = await findTagSummary({ catalog }, target.id);
      await reply
        .code(200)
        .send(tagSummarySchema.parse({ ...outcome.tag, productCount: listed?.productCount ?? 0 }));
    },
  );
}
