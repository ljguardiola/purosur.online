import fastifyStatic from "@fastify/static";
import { setupFastifyErrorHandler as defaultSetupFastifyErrorHandler } from "@sentry/node";
import Fastify, { type FastifyInstance } from "fastify";

export interface BuildAppOptions {
  /** The deployed version (commit SHA), reported by `GET /health`. */
  version: string;
  /**
   * Wires unhandled route errors to Sentry. Defaults to `@sentry/node`'s own
   * `setupFastifyErrorHandler`; a caller injects a fake to prove the wiring in a test without a
   * live Sentry client.
   */
  setupFastifyErrorHandler?: (app: FastifyInstance) => void;
  /**
   * The backoffice's built static assets (its `dist/`, containing `index.html`). When given, a
   * GET request that matches neither a registered route nor a real file under this directory
   * falls back to `index.html`, so the backoffice's own client-side router handles it — a plain
   * static file server would 404 on a deep link instead. Omitted in tests that don't need it, and
   * locally unless `BACKOFFICE_STATIC_DIR` is set (see server.ts).
   */
  staticDir?: string | undefined;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify();

  const setupFastifyErrorHandler =
    options.setupFastifyErrorHandler ?? defaultSetupFastifyErrorHandler;
  setupFastifyErrorHandler(app);

  app.get("/health", async () => ({ status: "ok", version: options.version }));

  const staticDir = options.staticDir;
  if (staticDir) {
    app.register(fastifyStatic, { root: staticDir });
    app.setNotFoundHandler((request, reply) => {
      if (request.method !== "GET") {
        reply.code(404).send();
        return;
      }
      reply.sendFile("index.html");
    });
  }

  return app;
}
