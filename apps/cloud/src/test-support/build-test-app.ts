import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type {
  FastifyInstance,
  InjectOptions,
  LightMyRequestCallback,
  LightMyRequestChain,
  LightMyRequestResponse,
} from "fastify";
import { type BuildAppOptions, buildApp } from "../app.js";
import { EDGE_ORIGIN_SECRET_HEADER } from "../platform/edge-origin-guard.js";

/** Not a real secret: only ever compared against itself, inside this test helper. */
export const TEST_EDGE_ORIGIN_SECRET = "test-edge-origin-secret";

export function buildTestApp<TQueryResult extends PgQueryResultHKT = PostgresJsQueryResultHKT>(
  options: Omit<BuildAppOptions<TQueryResult>, "edgeOriginSecret">,
): FastifyInstance {
  const app = buildApp({ ...options, edgeOriginSecret: TEST_EDGE_ORIGIN_SECRET });

  const rawInject = app.inject.bind(app);
  const withEdgeOriginSecret = (injectOptions: InjectOptions | string): InjectOptions => {
    const normalized: InjectOptions =
      typeof injectOptions === "string" ? { url: injectOptions } : injectOptions;
    return {
      ...normalized,
      headers: { [EDGE_ORIGIN_SECRET_HEADER]: TEST_EDGE_ORIGIN_SECRET, ...normalized.headers },
    };
  };
  function inject(injectOptions: InjectOptions | string, callback: LightMyRequestCallback): void;
  function inject(injectOptions: InjectOptions | string): Promise<LightMyRequestResponse>;
  function inject(): LightMyRequestChain;
  function inject(injectOptions?: InjectOptions | string, callback?: LightMyRequestCallback) {
    if (injectOptions === undefined) {
      return rawInject().headers({ [EDGE_ORIGIN_SECRET_HEADER]: TEST_EDGE_ORIGIN_SECRET });
    }
    return callback
      ? rawInject(withEdgeOriginSecret(injectOptions), callback)
      : rawInject(withEdgeOriginSecret(injectOptions));
  }
  app.inject = inject;

  return app;
}
