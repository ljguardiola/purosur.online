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
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify();

  const setupFastifyErrorHandler =
    options.setupFastifyErrorHandler ?? defaultSetupFastifyErrorHandler;
  setupFastifyErrorHandler(app);

  app.get("/health", async () => ({ status: "ok", version: options.version }));

  return app;
}
