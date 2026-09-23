import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type { FastifyInstance, InjectOptions } from "fastify";
import { type BuildAppOptions, buildApp } from "../app.js";
import { EDGE_ORIGIN_SECRET_HEADER } from "../edge-origin-guard.js";

/** Not a real secret: only ever compared against itself, inside this test helper. */
export const TEST_EDGE_ORIGIN_SECRET = "test-edge-origin-secret";

/**
 * Builds the app exactly as production does, with a fixed test secret, and makes every
 * `inject()` call on it carry the matching edge header by default (still overridable per call).
 * `buildApp` requires `edgeOriginSecret` so a missing secret can never leave the guard silently
 * open; this helper exists so the many route tests that predate the edge guard don't each need to
 * know it exists.
 */
export function buildTestApp<TQueryResult extends PgQueryResultHKT = PostgresJsQueryResultHKT>(
  options: Omit<BuildAppOptions<TQueryResult>, "edgeOriginSecret">,
): FastifyInstance {
  const app = buildApp({ ...options, edgeOriginSecret: TEST_EDGE_ORIGIN_SECRET });

  const rawInject = app.inject.bind(app);
  app.inject = ((injectOptions: InjectOptions | string) => {
    const normalized: InjectOptions =
      typeof injectOptions === "string" ? { url: injectOptions } : injectOptions;
    return rawInject({
      ...normalized,
      headers: { [EDGE_ORIGIN_SECRET_HEADER]: TEST_EDGE_ORIGIN_SECRET, ...normalized.headers },
    });
  }) as unknown as typeof app.inject;

  return app;
}
