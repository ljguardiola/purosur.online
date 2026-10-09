import { tagListSchema } from "@purosur/contracts";
import { listTags } from "@purosur/domain/catalog/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleCatalogListReader } from "./drizzle-catalog-list-reader.js";

export interface TagsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

export function registerTagsListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: TagsRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const catalog = new DrizzleCatalogListReader(options.db);

  app.get(
    "/tags",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: {
        access: capabilityAccess("products_and_categories"),
        sessionSource,
      },
    },
    async (_request, reply) => {
      await reply.code(200).send(tagListSchema.parse(await listTags({ catalog })));
    },
  );
}
