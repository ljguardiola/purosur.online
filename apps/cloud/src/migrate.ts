import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export interface RunMigrationsOptions {
  migrationsFolder?: string;
  /** Kept short in tests so an unreachable database fails fast instead of hanging. */
  connectTimeoutSeconds?: number;
  /** Total time budget to wait for the database to accept connections before giving up.
   * Defaults to MIGRATE_DATABASE_WAIT_SECONDS, or 60 seconds if that is not set. */
  waitForDatabaseSeconds?: number;
  /** Interval between connection probes while waiting. */
  waitIntervalMs?: number;
  /** Injected in tests so waiting does not consume real time. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const DEFAULT_MIGRATIONS_FOLDER = new URL("../migrations", import.meta.url).pathname;
const DEFAULT_WAIT_FOR_DATABASE_SECONDS = 60;
const DEFAULT_WAIT_INTERVAL_MS = 1000;

// A connection can fail either as a native Node socket error (ECONNREFUSED, ENOTFOUND, ...) or as
// a postgres.js protocol-level error (CONNECT_TIMEOUT, CONNECTION_CLOSED, ...); both expose the
// same failure as `error.code`. 57P03 is Postgres's own SQLSTATE for "the database system is
// starting up and not yet accepting connections" (cannot_connect_now).
const RETRYABLE_CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ECONNABORTED",
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "57P03",
]);

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/**
 * True only for errors that mean the database was not reachable or not ready yet. Any other
 * error — a failing migration statement, wrong credentials, an unknown database — must not be
 * retried, so it stops the deploy immediately instead of masking it behind a retry loop.
 */
export function isRetryableConnectionError(error: unknown): boolean {
  const code = errorCode(error);
  return code !== undefined && RETRYABLE_CONNECTION_ERROR_CODES.has(code);
}

export interface WaitForDatabaseOptions {
  budgetSeconds: number;
  intervalMs: number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  onWaiting?: (error: unknown, elapsedMs: number) => void;
}

/**
 * Calls `probe` until it resolves, retrying only retryable connection failures on `intervalMs`
 * until `budgetSeconds` has elapsed, then rejects with the last such error. Any non-retryable
 * error from `probe` is rethrown immediately, without waiting.
 */
export async function waitForDatabase(
  probe: () => Promise<unknown>,
  options: WaitForDatabaseOptions,
): Promise<void> {
  const start = options.now();
  const deadline = start + options.budgetSeconds * 1000;

  for (;;) {
    try {
      await probe();
      return;
    } catch (error) {
      if (!isRetryableConnectionError(error)) {
        throw error;
      }
      if (options.now() >= deadline) {
        throw error;
      }
      options.onWaiting?.(error, options.now() - start);
      await options.sleep(options.intervalMs);
    }
  }
}

function waitForDatabaseSecondsFromEnv(): number | undefined {
  const raw = process.env.MIGRATE_DATABASE_WAIT_SECONDS;
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Runs pending migrations against `databaseUrl`. This is the pre-deploy command: it runs before
 * the new deployment takes traffic, never at application startup (see server.ts), so a migration
 * failure stops the deploy instead of starting a worker against an unmigrated schema.
 *
 * A database created in the same deploy is not immediately ready to accept connections (see
 * issue #154), so this first waits, within a bounded budget, until the database responds to a
 * trivial query before running any migration.
 */
export async function runMigrations(
  databaseUrl: string,
  options: RunMigrationsOptions = {},
): Promise<void> {
  const migrationsFolder = options.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER;
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: options.connectTimeoutSeconds ?? 10,
  });

  try {
    await waitForDatabase(() => sql`select 1`, {
      budgetSeconds:
        options.waitForDatabaseSeconds ??
        waitForDatabaseSecondsFromEnv() ??
        DEFAULT_WAIT_FOR_DATABASE_SECONDS,
      intervalMs: options.waitIntervalMs ?? DEFAULT_WAIT_INTERVAL_MS,
      sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
      now: options.now ?? Date.now,
      onWaiting: (error, elapsedMs) => {
        console.error(
          `migrate: database not ready yet after ${Math.round(elapsedMs / 1000)}s (${errorCode(error) ?? "unknown error"}), retrying...`,
        );
      },
    });

    await migrate(drizzle(sql), { migrationsFolder });
  } finally {
    await sql.end({ timeout: 1 });
  }
}

const isMainModule =
  process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("migrate: DATABASE_URL is not set");
    process.exit(1);
  } else {
    runMigrations(databaseUrl)
      .then(() => {
        console.log("migrate: done");
      })
      .catch((error: unknown) => {
        console.error("migrate: failed", error);
        process.exit(1);
      });
  }
}
