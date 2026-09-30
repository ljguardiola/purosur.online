import { X509Certificate } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as Sentry from "@sentry/node";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { FastifyInstance } from "fastify";
import { makeWorkerUtils, type WorkerUtils } from "graphile-worker";
import pg from "pg";
import postgres from "postgres";
import { createGraphileRecoveryJobQueue } from "./access/graphile-recovery-job-queue.js";
import { reportPoolErrors } from "./access/pool-connection-error-handler.js";
import type { RecoveryEmailSender } from "./access/recovery-email-sender.js";
import type { RecoveryJobQueue } from "./access/recovery-job-queue.js";
import { type RecoveryWorkerHandle, startRecoveryWorker } from "./access/recovery-worker.js";
import {
  type RecoveryEmailSenderEnv,
  selectRecoveryEmailSender,
} from "./access/select-recovery-email-sender.js";
import { type BackofficeErrorReporting, type BuildAppOptions, buildApp } from "./app.js";
import { parseCuit } from "./fiscal/cuit.js";
import { runShutdownSteps } from "./platform/run-shutdown-steps.js";
import { initSentry } from "./platform/sentry.js";

export interface ServerEnv {
  PORT?: string | undefined;
  APP_VERSION?: string | undefined;
  SENTRY_DSN?: string | undefined;
  SENTRY_ENVIRONMENT?: string | undefined;
  BACKOFFICE_SENTRY_DSN?: string | undefined;
  BACKOFFICE_STATIC_DIR?: string | undefined;
  DATABASE_URL?: string | undefined;
  DEVICE_TOKEN_ROTATION_KEY?: string | undefined;
  INSTALLATION_KEYS_ENCRYPTION_KEY?: string | undefined;
  RESEND_API_KEY?: string | undefined;
  RECOVERY_EMAIL_FROM?: string | undefined;
  RECOVERY_EMAIL_REPLY_TO?: string | undefined;
  BACKOFFICE_ORIGIN?: string | undefined;
  RECOVERY_EMAIL_TRANSPORT?: string | undefined;
  EDGE_ORIGIN_SECRET?: string | undefined;
  /** PEM text of the ARCA X.509 certificate authorizing this business at the tax authority. */
  ARCA_CERTIFICATE?: string | undefined;
}

const DEFAULT_PORT = 3000;
const DEFAULT_VERSION = "unknown";

const DEFAULT_STATIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

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

function resolveBackofficeErrorReporting(env: ServerEnv): BackofficeErrorReporting | undefined {
  if (!env.BACKOFFICE_SENTRY_DSN) {
    return undefined;
  }
  if (!env.SENTRY_ENVIRONMENT) {
    throw new Error("SENTRY_ENVIRONMENT must be set when BACKOFFICE_SENTRY_DSN is");
  }
  return { dsn: env.BACKOFFICE_SENTRY_DSN, environment: env.SENTRY_ENVIRONMENT };
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

/** Required unconditionally: the edge guard applies to every route (`GET /api/health` excepted). */
function requireEdgeOriginSecret(env: ServerEnv): string {
  const value = env.EDGE_ORIGIN_SECRET;
  if (!value) {
    throw new Error("EDGE_ORIGIN_SECRET must be set");
  }
  return value;
}

const DEVICE_TOKEN_ROTATION_KEY_MIN_BYTES = 32;

export function requireDeviceTokenRotationKey(env: ServerEnv): Buffer {
  const encoded = env.DEVICE_TOKEN_ROTATION_KEY;
  if (!encoded) {
    throw new Error("DEVICE_TOKEN_ROTATION_KEY must be set once DATABASE_URL is configured");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length < DEVICE_TOKEN_ROTATION_KEY_MIN_BYTES) {
    throw new Error(
      `DEVICE_TOKEN_ROTATION_KEY must hold at least ${DEVICE_TOKEN_ROTATION_KEY_MIN_BYTES} bytes`,
    );
  }
  return key;
}

const INSTALLATION_KEYS_ENCRYPTION_KEY_BYTES = 32;

export function requireInstallationKeysEncryptionKey(env: ServerEnv): Buffer {
  const encoded = env.INSTALLATION_KEYS_ENCRYPTION_KEY;
  if (!encoded) {
    throw new Error("INSTALLATION_KEYS_ENCRYPTION_KEY must be set once DATABASE_URL is configured");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== INSTALLATION_KEYS_ENCRYPTION_KEY_BYTES) {
    throw new Error(
      `INSTALLATION_KEYS_ENCRYPTION_KEY must hold exactly ${INSTALLATION_KEYS_ENCRYPTION_KEY_BYTES} bytes`,
    );
  }
  return key;
}

const CUIT_SERIAL_NUMBER_PATTERN = /^CUIT (?<cuitDigits>\d{11})$/;
const SERIAL_NUMBER_PREFIX = "serialNumber=";

/** Node renders each RDN on its own line, joining a multi-valued RDN's attributes with ` + `. */
function extractSerialNumber(subject: string): string | undefined {
  for (const line of subject.split("\n")) {
    for (const attribute of line.split(" + ")) {
      if (attribute.startsWith(SERIAL_NUMBER_PREFIX)) {
        return attribute.slice(SERIAL_NUMBER_PREFIX.length);
      }
    }
  }
  return undefined;
}

/**
 * Railway and GitHub deliver a multi-line variable either with real newlines or, collapsed to one
 * line, as the literal two-character sequence `\n`; both are accepted so the PEM parses either way.
 */
function normalizePemNewlines(pem: string): string {
  return pem.includes("\\n") ? pem.replaceAll("\\n", "\n") : pem;
}

/** ARCA's X.509 subject carries the authorized CUIT as `serialNumber=CUIT <11 digits>`. */
export function requireAuthorizedCuit(env: ServerEnv): string {
  const pem = env.ARCA_CERTIFICATE;
  if (!pem) {
    throw new Error("ARCA_CERTIFICATE must be set once DATABASE_URL is configured");
  }
  let certificate: X509Certificate;
  try {
    certificate = new X509Certificate(normalizePemNewlines(pem));
  } catch (cause) {
    throw new Error("ARCA_CERTIFICATE must be a valid X.509 certificate", { cause });
  }
  const serialNumber = extractSerialNumber(certificate.subject);
  if (!serialNumber) {
    throw new Error("ARCA_CERTIFICATE's subject has no serialNumber");
  }
  const cuitDigits = CUIT_SERIAL_NUMBER_PATTERN.exec(serialNumber)?.groups?.["cuitDigits"];
  if (!cuitDigits) {
    throw new Error('ARCA_CERTIFICATE\'s serialNumber must be in the form "CUIT <11 digits>"');
  }
  const normalized = parseCuit(cuitDigits);
  if (!normalized) {
    throw new Error("ARCA_CERTIFICATE's CUIT must have a correct check digit");
  }
  return normalized;
}

const LOG_RECOVERY_EMAIL_TRANSPORT_VALUE = "log";
const LOCAL_BACKOFFICE_ORIGIN_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

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
 * Fails closed to `resend`: an unset or misspelled `RECOVERY_EMAIL_TRANSPORT` must never silently
 * stop sending real recovery email, so a stray "log" value crashes startup instead of going dark.
 */
function resolveRecoveryEmailSenderEnv(env: ServerEnv): RecoveryEmailSenderEnv {
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
  createPool?: (connectionString: string) => Pick<pg.Pool, "on" | "end">;
}

/** graphile-worker's own `release()` ends a pool it created without awaiting it, so it's owned here. */
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
  /** Only an integration test injects a fake sender, to run this against a real Postgres without sending real email. */
  emailSender?: RecoveryEmailSender;
  /** Lets a test give the job-queue pool a `pg.Pool` with no idle reaper, so it doesn't race pg-pool's own idle timeout. */
  createJobQueuePool?: CreateRecoveryJobQueuePoolDeps["createPool"];
}

/**
 * graphile-worker's `run()` needs a real Postgres connection with LISTEN/NOTIFY, which this
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
  const jobQueuePool = createRecoveryJobQueuePool(
    recoveryEnv.databaseUrl,
    deps.createJobQueuePool ? { createPool: deps.createJobQueuePool } : {},
  );
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

  const version = resolveVersion(env);
  doInitSentry({ dsn: env.SENTRY_DSN, environment: env.SENTRY_ENVIRONMENT, release: version });

  const edgeOriginSecret = requireEdgeOriginSecret(env);
  const errorReporting = resolveBackofficeErrorReporting(env);
  const recoveryEnv = resolveRecoveryEnv(env);
  const database = recoveryEnv
    ? {
        authorizedCuit: requireAuthorizedCuit(env),
        deviceTokenRotationKey: requireDeviceTokenRotationKey(env),
        installationKeysEncryptionKey: requireInstallationKeysEncryptionKey(env),
        recovery: await doSetUpRecovery(recoveryEnv),
      }
    : undefined;

  const app = doBuildApp({
    version,
    edgeOriginSecret,
    staticDir: resolveStaticDir(env, DEFAULT_STATIC_DIR),
    ...(errorReporting ? { errorReporting } : {}),
    ...(database
      ? {
          recovery: {
            db: database.recovery.db,
            jobQueue: database.recovery.jobQueue,
            backofficeOrigin: database.recovery.backofficeOrigin,
          },
          session: {
            db: database.recovery.db,
            backofficeOrigin: database.recovery.backofficeOrigin,
          },
          passkeys: {
            db: database.recovery.db,
            backofficeOrigin: database.recovery.backofficeOrigin,
          },
          users: {
            db: database.recovery.db,
            backofficeOrigin: database.recovery.backofficeOrigin,
          },
          roles: {
            db: database.recovery.db,
            backofficeOrigin: database.recovery.backofficeOrigin,
          },
          branchSettings: {
            db: database.recovery.db,
            backofficeOrigin: database.recovery.backofficeOrigin,
          },
          issuerIdentification: {
            db: database.recovery.db,
            backofficeOrigin: database.recovery.backofficeOrigin,
            authorizedCuit: database.authorizedCuit,
          },
          categories: {
            db: database.recovery.db,
            backofficeOrigin: database.recovery.backofficeOrigin,
          },
          brands: {
            db: database.recovery.db,
            backofficeOrigin: database.recovery.backofficeOrigin,
          },
          products: {
            db: database.recovery.db,
            backofficeOrigin: database.recovery.backofficeOrigin,
          },
          alerts: {
            db: database.recovery.db,
            backofficeOrigin: database.recovery.backofficeOrigin,
          },
          prices: {
            db: database.recovery.db,
            backofficeOrigin: database.recovery.backofficeOrigin,
          },
          registers: {
            db: database.recovery.db,
            backofficeOrigin: database.recovery.backofficeOrigin,
          },
          stock: {
            db: database.recovery.db,
            backofficeOrigin: database.recovery.backofficeOrigin,
          },
          devices: {
            db: database.recovery.db,
            rotationKey: database.deviceTokenRotationKey,
            keysEncryptionKey: database.installationKeysEncryptionKey,
          },
        }
      : {}),
  });
  if (database) {
    app.addHook("onClose", () => database.recovery.close());
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

if (import.meta.main) {
  startServer().then(
    (app) => registerShutdownHandlers(app),
    (error: unknown) => reportStartupFailure(error),
  );
}
