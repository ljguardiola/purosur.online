import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as Sentry from "@sentry/node";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { FastifyInstance } from "fastify";
import { makeWorkerUtils, type WorkerUtils } from "graphile-worker";
import pg from "pg";
import postgres from "postgres";
import { type BuildAppOptions, buildApp } from "./app.js";
import { createGraphileRecoveryJobQueue } from "./recovery/graphile-recovery-job-queue.js";
import { reportPoolErrors } from "./recovery/pool-connection-error-handler.js";
import type { RecoveryEmailSender } from "./recovery/recovery-email-sender.js";
import type { RecoveryJobQueue } from "./recovery/recovery-job-queue.js";
import { type RecoveryWorkerHandle, startRecoveryWorker } from "./recovery/recovery-worker.js";
import { runShutdownSteps } from "./recovery/run-shutdown-steps.js";
import {
  type RecoveryEmailSenderEnv,
  selectRecoveryEmailSender,
} from "./recovery/select-recovery-email-sender.js";
import { initSentry } from "./sentry.js";

export type { RecoveryEmailSenderEnv };

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
  /** Opts into `resolveRecoveryEmailSenderEnv`'s logging transport on the exact value "log". */
  RECOVERY_EMAIL_TRANSPORT?: string | undefined;
  /** The value Cloudflare's edge sets on every request it forwards; see `edge-origin-guard.ts`. */
  EDGE_ORIGIN_SECRET?: string | undefined;
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
  emailSender: RecoveryEmailSenderEnv;
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
 * Required on every start, not only once a database is configured: the edge guard applies to
 * every route (`GET /health` excepted) regardless of which optional features are wired up.
 */
export function requireEdgeOriginSecret(env: ServerEnv): string {
  const value = env.EDGE_ORIGIN_SECRET;
  if (!value) {
    throw new Error("EDGE_ORIGIN_SECRET must be set");
  }
  return value;
}

const LOG_RECOVERY_EMAIL_TRANSPORT_VALUE = "log";
const LOCAL_BACKOFFICE_ORIGIN_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

/**
 * True only for a `BACKOFFICE_ORIGIN` whose hostname is exactly "localhost" or "127.0.0.1" (any
 * port); a malformed origin is never local.
 */
function isLocalBackofficeOrigin(backofficeOrigin: string | undefined): boolean {
  if (!backofficeOrigin) {
    return false;
  }
  try {
    return LOCAL_BACKOFFICE_ORIGIN_HOSTNAMES.has(new URL(backofficeOrigin).hostname);
  } catch {
    return false;
  }
}

/**
 * Fails closed to `resend`: only the exact value "log", together with a local `BACKOFFICE_ORIGIN`,
 * opts into the logging transport, so an unset or misspelled `RECOVERY_EMAIL_TRANSPORT` can never
 * silently stop sending real recovery email in a deployed environment, and a `log` value that
 * reaches a deployed environment by mistake fails startup loudly instead of silently going dark —
 * recovery is the only way back into an account, so a crash here is safer than a no-op. Deployed
 * environments never set `RECOVERY_EMAIL_TRANSPORT` at all, so they always resolve to `resend`.
 */
export function resolveRecoveryEmailSenderEnv(env: ServerEnv): RecoveryEmailSenderEnv {
  if (env.RECOVERY_EMAIL_TRANSPORT === LOG_RECOVERY_EMAIL_TRANSPORT_VALUE) {
    if (!isLocalBackofficeOrigin(env.BACKOFFICE_ORIGIN)) {
      throw new Error(
        "RECOVERY_EMAIL_TRANSPORT=log requires a local BACKOFFICE_ORIGIN (localhost or " +
          "127.0.0.1): the logging transport is for local development only",
      );
    }
    return { transport: "log" };
  }
  return { transport: "resend", resendApiKey: requireRecoveryEnvVar(env, "RESEND_API_KEY") };
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
    emailSender: resolveRecoveryEmailSenderEnv(env),
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

export interface CreateRecoveryJobQueuePoolDeps {
  /** Injected in tests; defaults to a real `pg.Pool` for `connectionString`. */
  createPool?: (connectionString: string) => Pick<pg.Pool, "on" | "end">;
}

/**
 * Owned here rather than by graphile-worker, whose own `release()` ends a pool it created without
 * waiting for it, and drops that pool's error handlers first.
 */
export function createRecoveryJobQueuePool(
  connectionString: string,
  deps: CreateRecoveryJobQueuePoolDeps = {},
): Pick<pg.Pool, "on" | "end"> {
  const doCreatePool = deps.createPool ?? ((url: string) => new pg.Pool({ connectionString: url }));
  const pool = doCreatePool(connectionString);
  reportPoolErrors(pool, "recovery job queue");
  return pool;
}

export interface RecoveryResources {
  worker: Pick<RecoveryWorkerHandle, "stop">;
  workerUtils: Pick<WorkerUtils, "release">;
  jobQueuePool: Pick<pg.Pool, "end">;
  sql: Pick<postgres.Sql, "end">;
}

export async function closeRecoveryResources({
  worker,
  workerUtils,
  jobQueuePool,
  sql,
}: RecoveryResources): Promise<void> {
  await runShutdownSteps([
    { label: "recovery worker", run: () => worker.stop() },
    { label: "job-queue utilities", run: async () => void (await workerUtils.release()) },
    { label: "job-queue pool", run: () => jobQueuePool.end() },
    { label: "database client", run: () => sql.end({ timeout: 1 }) },
  ]);
}

export interface SetUpRecoveryDeps {
  /**
   * Only the apps/cloud/src/recovery/*.integration.test.ts suite injects this (a fake sender), so
   * it can run this same function — a real postgres-js pool and graphile-worker's real `run()` —
   * against a real Testcontainers Postgres without sending a real email. Production never passes
   * it, so `startServer` always gets the sender `resolveRecoveryEmailSenderEnv` selected.
   */
  emailSender?: RecoveryEmailSender;
}

/**
 * Connects to the database for the HTTP request path, and separately starts graphile-worker
 * (`recovery-worker.ts`) so this same process also processes the jobs `POST
 * /users/recovery/request` enqueues. Covered by apps/cloud/src/recovery/*.integration.test.ts
 * against a real Testcontainers Postgres: graphile-worker's `run()` expects its schema already
 * installed by `migrate.ts` and needs a real Postgres connection with LISTEN/NOTIFY, which this
 * repository's PGlite-based test database does not provide.
 */
export async function setUpRecovery(
  recoveryEnv: RecoveryEnv,
  deps: SetUpRecoveryDeps = {},
): Promise<RecoveryInfrastructure> {
  const sql = postgres(recoveryEnv.databaseUrl);
  const db = drizzle(sql);
  const emailSender =
    deps.emailSender ??
    selectRecoveryEmailSender({
      emailSender: recoveryEnv.emailSender,
      emailFrom: recoveryEnv.emailFrom,
      emailReplyTo: recoveryEnv.emailReplyTo,
    });
  const worker = await startRecoveryWorker({
    databaseUrl: recoveryEnv.databaseUrl,
    backofficeOrigin: recoveryEnv.backofficeOrigin,
    emailSender,
  });
  const jobQueuePool = createRecoveryJobQueuePool(recoveryEnv.databaseUrl);
  const workerUtils = await makeWorkerUtils({ pgPool: jobQueuePool as pg.Pool });
  const jobQueue = createGraphileRecoveryJobQueue(workerUtils);

  return {
    db,
    jobQueue,
    backofficeOrigin: recoveryEnv.backofficeOrigin,
    worker,
    close: () => closeRecoveryResources({ worker, workerUtils, jobQueuePool, sql }),
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

  const edgeOriginSecret = requireEdgeOriginSecret(env);
  const recoveryEnv = resolveRecoveryEnv(env);
  const recovery = recoveryEnv ? await doSetUpRecovery(recoveryEnv) : undefined;

  const app = doBuildApp({
    version: resolveVersion(env),
    edgeOriginSecret,
    staticDir: resolveStaticDir(env, DEFAULT_STATIC_DIR),
    ...(recovery
      ? {
          recovery: {
            db: recovery.db,
            jobQueue: recovery.jobQueue,
            backofficeOrigin: recovery.backofficeOrigin,
          },
          session: {
            db: recovery.db,
            backofficeOrigin: recovery.backofficeOrigin,
          },
          passkeys: {
            db: recovery.db,
            backofficeOrigin: recovery.backofficeOrigin,
          },
          users: {
            db: recovery.db,
            backofficeOrigin: recovery.backofficeOrigin,
          },
          roles: {
            db: recovery.db,
            backofficeOrigin: recovery.backofficeOrigin,
          },
          branchSettings: {
            db: recovery.db,
            backofficeOrigin: recovery.backofficeOrigin,
          },
          categories: {
            db: recovery.db,
            backofficeOrigin: recovery.backofficeOrigin,
          },
          products: {
            db: recovery.db,
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
