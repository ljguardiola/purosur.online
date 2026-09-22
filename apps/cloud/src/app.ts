import { extname, relative, sep } from "node:path";
import fastifyStatic from "@fastify/static";
import { setupFastifyErrorHandler as defaultSetupFastifyErrorHandler } from "@sentry/node";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import { registerRecoveryRedemptionRoutes } from "./recovery/recovery-redemption-route.js";
import type { RecoveryRouteOptions } from "./recovery/request-recovery-route.js";
import { registerRecoveryRoutes } from "./recovery/request-recovery-route.js";

export interface BuildAppOptions<TQueryResult extends PgQueryResultHKT = PostgresJsQueryResultHKT> {
  /** The deployed version (commit SHA), reported by `GET /health`. */
  version: string;
  /**
   * Wires unhandled route errors to Sentry. Defaults to `@sentry/node`'s own
   * `setupFastifyErrorHandler`; a caller injects a fake to prove the wiring in a test without a
   * live Sentry client.
   */
  setupFastifyErrorHandler?: (app: FastifyInstance) => void;
  /**
   * The backoffice's build (its `dist/`, containing `index.html`). A GET or HEAD for a path with
   * no file extension that matches neither a route nor a file gets `index.html`, so the
   * backoffice's client-side router handles deep links.
   */
  staticDir?: string | undefined;
  /**
   * Registers every `POST /users/recovery/*` route (request, registration-options, redeem) when
   * given. Left out, the service still starts (e.g. in a test that has no database), the same
   * way `staticDir` is optional above.
   */
  recovery?: RecoveryRouteOptions<TQueryResult>;
}

const backofficeSecurityHeaders: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

// Vite names every file under assets/ by its content hash, so an asset URL never changes content.
function cacheControlFor(staticDir: string, filePath: string): string {
  const [topLevel] = relative(staticDir, filePath).split(sep);
  return topLevel === "assets" ? "public, max-age=31536000, immutable" : "no-cache";
}

export function buildApp<TQueryResult extends PgQueryResultHKT = PostgresJsQueryResultHKT>(
  options: BuildAppOptions<TQueryResult>,
): FastifyInstance {
  const app = Fastify();

  const setupFastifyErrorHandler =
    options.setupFastifyErrorHandler ?? defaultSetupFastifyErrorHandler;
  setupFastifyErrorHandler(app);

  app.get("/health", async () => ({ status: "ok", version: options.version }));

  if (options.recovery) {
    registerRecoveryRoutes(app, options.recovery);
    registerRecoveryRedemptionRoutes(app, options.recovery);
  }

  const staticDir = options.staticDir;
  if (staticDir) {
    app.register(fastifyStatic, {
      root: staticDir,
      setHeaders: (reply, filePath) => {
        reply.headers(backofficeSecurityHeaders);
        reply.header("Cache-Control", cacheControlFor(staticDir, filePath));
      },
    });
    app.setNotFoundHandler((request, reply) => {
      const isClientRoute = extname(new URL(request.url, "http://localhost").pathname) === "";
      if ((request.method !== "GET" && request.method !== "HEAD") || !isClientRoute) {
        reply.code(404).send();
        return;
      }
      reply.sendFile("index.html");
    });
  }

  return app;
}
