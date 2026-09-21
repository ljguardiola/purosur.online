import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as Sentry from "@sentry/node";
import type { FastifyInstance } from "fastify";
import { type BuildAppOptions, buildApp } from "./app.js";
import { initSentry } from "./sentry.js";

export interface ServerEnv {
  PORT?: string | undefined;
  APP_VERSION?: string | undefined;
  SENTRY_DSN?: string | undefined;
  SENTRY_ENVIRONMENT?: string | undefined;
  BACKOFFICE_STATIC_DIR?: string | undefined;
}

const DEFAULT_PORT = 3000;
const DEFAULT_VERSION = "unknown";

// `pnpm --filter @purosur/cloud deploy --prod` (see apps/cloud/Dockerfile) puts this compiled
// server at <deploy>/dist/server.js; the Dockerfile copies the backoffice's own build to
// <deploy>/public next to it, so this resolves there by default with no env var needed in the
// common case. BACKOFFICE_STATIC_DIR still overrides it for any other layout.
const DEFAULT_STATIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

/** `APP_VERSION` is baked into the image at build time (the commit SHA); "unknown" is a dev-only fallback. */
export function resolveVersion(env: ServerEnv): string {
  return env.APP_VERSION ? env.APP_VERSION : DEFAULT_VERSION;
}

export function resolvePort(env: ServerEnv): number {
  const parsed = env.PORT ? Number.parseInt(env.PORT, 10) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

/**
 * An explicit `BACKOFFICE_STATIC_DIR` is trusted even if it doesn't exist yet, so a real
 * misconfiguration fails loudly at startup instead of silently serving no backoffice. The
 * conventional default is only used when it actually exists on disk, so a plain `cloud` checkout
 * with no backoffice build still starts and serves `/health` — it just 404s everything else,
 * exactly as it did before this option existed.
 */
export function resolveStaticDir(env: ServerEnv, defaultDir: string): string | undefined {
  if (env.BACKOFFICE_STATIC_DIR) {
    return env.BACKOFFICE_STATIC_DIR;
  }
  return existsSync(defaultDir) ? defaultDir : undefined;
}

export interface StartServerDeps {
  initSentry?: typeof initSentry;
  buildApp?: (options: BuildAppOptions) => FastifyInstance;
}

export async function startServer(
  env: ServerEnv = process.env,
  deps: StartServerDeps = {},
): Promise<FastifyInstance> {
  const doInitSentry = deps.initSentry ?? initSentry;
  const doBuildApp = deps.buildApp ?? buildApp;

  doInitSentry({ dsn: env.SENTRY_DSN, environment: env.SENTRY_ENVIRONMENT });

  const app = doBuildApp({
    version: resolveVersion(env),
    staticDir: resolveStaticDir(env, DEFAULT_STATIC_DIR),
  });
  await app.listen({ port: resolvePort(env), host: "0.0.0.0" });
  return app;
}

const SENTRY_FLUSH_TIMEOUT_MS = 2000;

export interface ExitDeps {
  flush?: (timeoutMs: number) => PromiseLike<boolean>;
  exit?: (code: number) => void;
}

export interface ClosableApp {
  close(): PromiseLike<unknown>;
}

export async function shutdownServer(app: ClosableApp, deps: ExitDeps = {}): Promise<void> {
  const flush = deps.flush ?? Sentry.flush;
  const exit = deps.exit ?? process.exit;

  let exitCode = 0;
  try {
    await app.close();
  } catch (error) {
    console.error(error);
    exitCode = 1;
  }
  await flush(SENTRY_FLUSH_TIMEOUT_MS);
  exit(exitCode);
}

export interface SignalSource {
  once(signal: "SIGTERM" | "SIGINT", listener: () => void): unknown;
}

/** Node running as the container's PID 1 ignores SIGTERM unless a handler is registered. */
export function registerShutdownHandlers(
  app: ClosableApp,
  deps: ExitDeps & { signals?: SignalSource } = {},
): void {
  const signals = deps.signals ?? process;
  let shuttingDown = false;
  const onSignal = () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    void shutdownServer(app, deps);
  };
  signals.once("SIGTERM", onSignal);
  signals.once("SIGINT", onSignal);
}

export async function reportStartupFailure(
  error: unknown,
  deps: ExitDeps & { captureException?: (error: unknown) => unknown } = {},
): Promise<void> {
  const captureException = deps.captureException ?? Sentry.captureException;
  const flush = deps.flush ?? Sentry.flush;
  const exit = deps.exit ?? process.exit;

  console.error(error);
  captureException(error);
  await flush(SENTRY_FLUSH_TIMEOUT_MS);
  exit(1);
}

const isMainModule =
  process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  startServer().then(
    (app) => registerShutdownHandlers(app),
    (error: unknown) => reportStartupFailure(error),
  );
}
