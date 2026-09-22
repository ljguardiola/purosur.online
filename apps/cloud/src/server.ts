import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as Sentry from "@sentry/node";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { FastifyInstance } from "fastify";
import { makeWorkerUtils } from "graphile-worker";
import pg from "pg";
import postgres from "postgres";
import { type BuildAppOptions, buildApp } from "./app.js";
import { createGraphileRecoveryJobQueue } from "./recovery/graphile-recovery-job-queue.js";
import type { RecoveryEmailSender } from "./recovery/recovery-email-sender.js";
import type { RecoveryJobQueue } from "./recovery/recovery-job-queue.js";
import { type RecoveryWorkerHandle, startRecoveryWorker } from "./recovery/recovery-worker.js";
import { createResendRecoveryEmailSender } from "./recovery/resend-email-sender.js";
import { initSentry } from "./sentry.js";

export interface ServerEnv {
  PORT?: string | undefined;
  APP_VERSION?: string | undefined;
  SENTRY_DSN?: string | undefined;
  SENTRY_ENVIRONMENT?: string | undefined;
  BACKOFFICE_STATIC_DIR?: string | undefined;
  /** Once set, the recovery-by-email feature wires up: see `resolveRecoveryEnv`. */
  DATABASE_URL?: string | undefined;
  RESEND_API_KEY?: string | undefined;
  RECOVERY_EMAIL_FROM?: string | undefined;
  RECOVERY_EMAIL_REPLY_TO?: string | undefined;
  BACKOFFICE_ORIGIN?: string | undefined;
}

const DEFAULT_PORT = 3000;
const DEFAULT_VERSION = "unknown";

// apps/cloud/Dockerfile copies the backoffice build to public/, a sibling of this file's dist/.
const DEFAULT_STATIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

/** `APP_VERSION` is baked into the image at build time (the commit SHA); "unknown" is a dev-only fallback. */
export function resolveVersion(env: ServerEnv): string {
  return env.APP_VERSION ? env.APP_VERSION : DEFAULT_VERSION;
}

export function resolvePort(env: ServerEnv): number {
  const parsed = env.PORT ? Number.parseInt(env.PORT, 10) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

function holdsBackofficeBuild(dir: string): boolean {
  return existsSync(join(dir, "index.html"));
}

/**
 * An explicit `BACKOFFICE_STATIC_DIR` must hold a build, or startup fails. The default directory
 * is used only when it holds one, so the service still starts without a backoffice build.
 */
export function resolveStaticDir(env: ServerEnv, defaultDir: string): string | undefined {
  const explicitDir = env.BACKOFFICE_STATIC_DIR;
  if (explicitDir) {
    if (!holdsBackofficeBuild(explicitDir)) {
      throw new Error(`BACKOFFICE_STATIC_DIR has no index.html: ${explicitDir}`);
    }
    return explicitDir;
  }
  return holdsBackofficeBuild(defaultDir) ? defaultDir : undefined;
}

export interface RecoveryEnv {
  databaseUrl: string;
  resendApiKey: string;
  emailFrom: string;
  emailReplyTo: string;
  backofficeOrigin: string;
}

function requireRecoveryEnvVar(env: ServerEnv, name: keyof ServerEnv & string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} must be set once DATABASE_URL is configured (recovery-by-email)`);
  }
  return value;
}

/**
 * The recovery-by-email feature wires up once `DATABASE_URL` is set, the same
 * dev-friendly default `resolveStaticDir` uses for the backoffice build above: a missing database
 * lets the service start without it (e.g. in a test), but a configured database with the rest of
 * this config missing is a real misconfiguration and fails fast instead of starting half-wired.
 */
export function resolveRecoveryEnv(env: ServerEnv): RecoveryEnv | undefined {
  if (!env.DATABASE_URL) {
    return undefined;
  }
  return {
    databaseUrl: env.DATABASE_URL,
    resendApiKey: requireRecoveryEnvVar(env, "RESEND_API_KEY"),
    emailFrom: requireRecoveryEnvVar(env, "RECOVERY_EMAIL_FROM"),
    emailReplyTo: requireRecoveryEnvVar(env, "RECOVERY_EMAIL_REPLY_TO"),
    backofficeOrigin: requireRecoveryEnvVar(env, "BACKOFFICE_ORIGIN"),
  };
}

export interface RecoveryInfrastructure {
  db: PostgresJsDatabase<Record<string, never>>;
  jobQueue: RecoveryJobQueue;
  backofficeOrigin: string;
  worker: RecoveryWorkerHandle;
  close(): Promise<void>;
}

export interface SetUpRecoveryDeps {
  /**
   * Only the apps/cloud/src/recovery/*.integration.test.ts suite injects this (a fake sender), so
   * it can run this same function — a real postgres-js pool and graphile-worker's real `run()` —
   * against a real Testcontainers Postgres without sending a real email. Production never passes
   * it, so `startServer` always gets the real Resend sender below.
   */
  emailSender?: RecoveryEmailSender;
}

/**
 * Connects to the database for the HTTP request path, and separately starts graphile-worker
 * (`recovery-worker.ts`) so this same process also processes the jobs `POST
 * /users/recovery/request` enqueues. Covered by apps/cloud/src/recovery/*.integration.test.ts
 * against a real Testcontainers Postgres: graphile-worker's `run()` installs its own schema and
 * needs a real Postgres connection with LISTEN/NOTIFY, which this repository's PGlite-based test
 * database does not provide.
 */
export async function setUpRecovery(
  recoveryEnv: RecoveryEnv,
  deps: SetUpRecoveryDeps = {},
): Promise<RecoveryInfrastructure> {
  const sql = postgres(recoveryEnv.databaseUrl);
  const db = drizzle(sql);
  const emailSender =
    deps.emailSender ??
    createResendRecoveryEmailSender({
      apiKey: recoveryEnv.resendApiKey,
      from: recoveryEnv.emailFrom,
      replyTo: recoveryEnv.emailReplyTo,
    });
  const worker = await startRecoveryWorker({
    databaseUrl: recoveryEnv.databaseUrl,
    backofficeOrigin: recoveryEnv.backofficeOrigin,
    emailSender,
  });
  // Owned here rather than by graphile-worker, whose own `release()` ends a pool it created without
  // waiting for it, and drops that pool's error handler first.
  const jobQueuePool = new pg.Pool({ connectionString: recoveryEnv.databaseUrl });
  jobQueuePool.on("error", (error) => {
    console.error("recovery job queue: idle database client failed", error);
  });
  const workerUtils = await makeWorkerUtils({ pgPool: jobQueuePool });
  const jobQueue = createGraphileRecoveryJobQueue(workerUtils);

  return {
    db,
    jobQueue,
    backofficeOrigin: recoveryEnv.backofficeOrigin,
    worker,
    async close() {
      await worker.stop();
      await workerUtils.release();
      await jobQueuePool.end();
      await sql.end({ timeout: 1 });
    },
  };
}

export interface StartServerDeps {
  initSentry?: typeof initSentry;
  buildApp?: (options: BuildAppOptions) => FastifyInstance;
  setUpRecovery?: (recoveryEnv: RecoveryEnv) => Promise<RecoveryInfrastructure>;
}

export async function startServer(
  env: ServerEnv = process.env,
  deps: StartServerDeps = {},
): Promise<FastifyInstance> {
  const doInitSentry = deps.initSentry ?? initSentry;
  const doBuildApp = deps.buildApp ?? buildApp;
  const doSetUpRecovery = deps.setUpRecovery ?? setUpRecovery;

  doInitSentry({ dsn: env.SENTRY_DSN, environment: env.SENTRY_ENVIRONMENT });

  const recoveryEnv = resolveRecoveryEnv(env);
  const recovery = recoveryEnv ? await doSetUpRecovery(recoveryEnv) : undefined;

  const app = doBuildApp({
    version: resolveVersion(env),
    staticDir: resolveStaticDir(env, DEFAULT_STATIC_DIR),
    ...(recovery
      ? {
          recovery: {
            db: recovery.db,
            jobQueue: recovery.jobQueue,
            backofficeOrigin: recovery.backofficeOrigin,
          },
        }
      : {}),
  });
  if (recovery) {
    app.addHook("onClose", () => recovery.close());
  }
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
