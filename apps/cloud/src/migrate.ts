import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { makeWorkerUtils } from "graphile-worker";
import pg from "pg";
import postgres from "postgres";
import { describeDatabaseFailure, errorCode } from "./db/describe-database-failure.js";
import { MIGRATIONS_FOLDER } from "./db/migrations-folder.js";

export interface RunMigrationsOptions {
  migrationsFolder?: string;
  connectTimeoutSeconds?: number;
  waitForDatabaseSeconds?: number;
  waitIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onWaiting?: (error: unknown, elapsedMs: number) => void;
}

const DEFAULT_WAIT_FOR_DATABASE_SECONDS = 60;
const DEFAULT_WAIT_INTERVAL_MS = 1000;

// This repository never sets GRAPHILE_WORKER_SCHEMA, so graphile-worker installs under its default name.
const GRAPHILE_WORKER_SCHEMA = "graphile_worker";
const CLOUD_APP_ROLE = "cloud_app";
const CLOUD_APP_POLICY = "cloud_app_full_access";

// 57P03 is Postgres's own SQLSTATE for "the database system is starting up" (cannot_connect_now);
// the rest are Node/postgres.js connection-failure codes.
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

/** Any other error (bad migration, wrong credentials, unknown database) fails immediately, never retried. */
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
  isRetryable?: (error: unknown) => boolean;
}

export async function waitForDatabase(
  probe: (remainingMs: number) => Promise<unknown>,
  options: WaitForDatabaseOptions,
): Promise<void> {
  const isRetryable = options.isRetryable ?? isRetryableConnectionError;
  const start = options.now();
  const deadline = start + options.budgetSeconds * 1000;

  for (;;) {
    try {
      await probe(Math.max(deadline - options.now(), 0));
      return;
    } catch (error) {
      if (!isRetryable(error)) {
        throw error;
      }
      const remainingMs = deadline - options.now();
      if (remainingMs <= 0) {
        throw error;
      }
      options.onWaiting?.(error, options.now() - start);
      await options.sleep(Math.min(options.intervalMs, remainingMs));
    }
  }
}

// postgres.js reads a connect timeout of 0 as "no timeout", so a spent budget still gets a floor.
const MIN_PROBE_CONNECT_TIMEOUT_SECONDS = 1;

export function probeConnectTimeoutSeconds(remainingMs: number, maxSeconds: number): number {
  return Math.max(Math.min(maxSeconds, remainingMs / 1000), MIN_PROBE_CONNECT_TIMEOUT_SECONDS);
}

// Each probe uses its own client: a reused postgres.js client adds its own growing reconnect
// backoff to every failed connection, which would stretch the wait far beyond its budget.
async function probeDatabase(databaseUrl: string, connectTimeoutSeconds: number): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: connectTimeoutSeconds });
  try {
    await sql`select 1`;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

function logWaiting(error: unknown, elapsedMs: number): void {
  console.error(
    `migrate: database not ready yet after ${Math.round(elapsedMs / 1000)}s (${errorCode(error)}), retrying...`,
  );
}

/**
 * graphile-worker enables row-level security on its own tables with no policy, which Postgres
 * reads as deny-all except for the owner; without a matching policy `cloud_app` would be refused
 * every row despite holding the grants below.
 */
async function grantCloudAppGraphileWorkerRowSecurityAccess(sql: postgres.Sql): Promise<void> {
  // Only a missing policy is created, never dropped and re-created: the previous deployment keeps
  // serving as `cloud_app` while this runs, and would be refused every row in between.
  const tablesWithoutPolicy = await sql<{ tablename: string }[]>`
    select t.tablename from pg_tables t
    where t.schemaname = ${GRAPHILE_WORKER_SCHEMA} and t.rowsecurity
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = t.schemaname and p.tablename = t.tablename
          and p.policyname = ${CLOUD_APP_POLICY}
      )
  `;
  for (const { tablename } of tablesWithoutPolicy) {
    await sql.unsafe(
      `create policy ${CLOUD_APP_POLICY} on ${GRAPHILE_WORKER_SCHEMA}.${tablename} for all to ${CLOUD_APP_ROLE} using (true) with check (true)`,
    );
  }
}

async function grantCloudAppGraphileWorkerAccess(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`grant usage on schema ${GRAPHILE_WORKER_SCHEMA} to ${CLOUD_APP_ROLE}`);
  await sql.unsafe(
    `grant select, insert, update, delete on all tables in schema ${GRAPHILE_WORKER_SCHEMA} to ${CLOUD_APP_ROLE}`,
  );
  await sql.unsafe(
    `grant usage, select on all sequences in schema ${GRAPHILE_WORKER_SCHEMA} to ${CLOUD_APP_ROLE}`,
  );
  await sql.unsafe(
    `grant execute on all functions in schema ${GRAPHILE_WORKER_SCHEMA} to ${CLOUD_APP_ROLE}`,
  );
  await grantCloudAppGraphileWorkerRowSecurityAccess(sql);
}

const SCRAM_ITERATIONS = 4096;
const SCRAM_SALT_BYTES = 16;
const SCRAM_KEY_BYTES = 32;

/**
 * Builds the SCRAM-SHA-256 verifier Postgres stores for a password (RFC 5802/7677), so a logged
 * failing `ALTER ROLE` statement never contains the plaintext. Skips SASLprep, matching postgres.js.
 */
export function scramSha256Verifier(password: string): string {
  const salt = randomBytes(SCRAM_SALT_BYTES);
  const saltedPassword = pbkdf2Sync(password, salt, SCRAM_ITERATIONS, SCRAM_KEY_BYTES, "sha256");
  const clientKey = createHmac("sha256", saltedPassword).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", saltedPassword).update("Server Key").digest();
  return `SCRAM-SHA-256$${SCRAM_ITERATIONS}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

/**
 * `ALTER ROLE ... PASSWORD` takes a literal, not a bind parameter; `format('%L', ...)` (an
 * ordinary function call, which does bind) builds the safely quoted statement instead.
 */
async function setCloudAppPassword(sql: postgres.Sql, password: string): Promise<void> {
  const formatString = `alter role ${CLOUD_APP_ROLE} login password %L`;
  const [row] = await sql<{ statement: string }[]>`
    select format(${formatString}::text, ${scramSha256Verifier(password)}::text) as statement
  `;
  if (!row) {
    throw new Error("migrate: building the cloud_app password statement returned no row");
  }
  await sql.unsafe(row.statement);
}

/**
 * graphile-worker installs its own handlers on a pool with no `error`/`connect` listener; without
 * one, an unhandled `error` event would crash the process instead of failing the migration.
 */
function createWorkerPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString });
  const logFailure = (error: Error) => {
    console.error(
      `migrate: graphile-worker database client failed ${describeDatabaseFailure(error)}`,
    );
  };
  pool.on("error", logFailure);
  pool.on("connect", (client) => {
    client.on("error", logFailure);
  });
  return pool;
}

/**
 * Runs before the deployment takes traffic (never at startup), as the schema-owning role — never
 * `cloud_app` — since graphile-worker would otherwise install its own schema lazily at startup,
 * requiring the running application to hold DDL privileges.
 */
export async function runMigrations(
  databaseUrl: string,
  cloudAppPassword: string,
  options: RunMigrationsOptions = {},
): Promise<void> {
  const migrationsFolder = options.migrationsFolder ?? MIGRATIONS_FOLDER;
  const connectTimeoutSeconds = options.connectTimeoutSeconds ?? 10;

  await waitForDatabase(
    (remainingMs) =>
      probeDatabase(databaseUrl, probeConnectTimeoutSeconds(remainingMs, connectTimeoutSeconds)),
    {
      budgetSeconds: options.waitForDatabaseSeconds ?? DEFAULT_WAIT_FOR_DATABASE_SECONDS,
      intervalMs: options.waitIntervalMs ?? DEFAULT_WAIT_INTERVAL_MS,
      sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
      now: options.now ?? Date.now,
      onWaiting: options.onWaiting ?? logWaiting,
    },
  );

  const sql = postgres(databaseUrl, { max: 1, connect_timeout: connectTimeoutSeconds });
  try {
    await migrate(drizzle(sql), { migrationsFolder });

    // Owned here rather than left to graphile-worker, whose own pool (the one it builds from a
    // `connectionString`) is ended without awaiting it on release, so this would otherwise return
    // while a connection to the database it just migrated is still closing.
    const workerPool = createWorkerPool(databaseUrl);
    try {
      const workerUtils = await makeWorkerUtils({ pgPool: workerPool });
      try {
        await workerUtils.migrate();
      } finally {
        await workerUtils.release();
      }
    } finally {
      await workerPool.end();
    }

    await grantCloudAppGraphileWorkerAccess(sql);
    await setCloudAppPassword(sql, cloudAppPassword);
  } finally {
    await sql.end({ timeout: 1 });
  }
}

const isMainModule =
  process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const databaseUrl = process.env.DATABASE_URL;
  const cloudAppPassword = process.env.CLOUD_APP_DATABASE_PASSWORD;
  if (!databaseUrl) {
    console.error("migrate: DATABASE_URL is not set");
    process.exit(1);
  } else if (!cloudAppPassword) {
    console.error("migrate: CLOUD_APP_DATABASE_PASSWORD is not set");
    process.exit(1);
  } else {
    runMigrations(databaseUrl, cloudAppPassword)
      .then(() => {
        console.log("migrate: done");
      })
      .catch((error: unknown) => {
        console.error(`migrate: failed ${describeDatabaseFailure(error)}`);
        process.exit(1);
      });
  }
}
