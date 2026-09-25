import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { makeWorkerUtils } from "graphile-worker";
import pg from "pg";
import postgres from "postgres";
import { describeDatabaseFailure, errorCode } from "./db/describe-database-failure.js";

export interface RunMigrationsOptions {
  migrationsFolder?: string;
  /** Kept short in tests so an unreachable database fails fast instead of hanging. */
  connectTimeoutSeconds?: number;
  /** Total time budget to wait for the database to accept connections before giving up. */
  waitForDatabaseSeconds?: number;
  /** Interval between connection probes while waiting. */
  waitIntervalMs?: number;
  /** Injected in tests so waiting does not consume real time. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onWaiting?: (error: unknown, elapsedMs: number) => void;
}

const DEFAULT_MIGRATIONS_FOLDER = new URL("../migrations", import.meta.url).pathname;
const DEFAULT_WAIT_FOR_DATABASE_SECONDS = 60;
const DEFAULT_WAIT_INTERVAL_MS = 1000;

// This repository never sets GRAPHILE_WORKER_SCHEMA, so graphile-worker always installs itself
// under its own default schema name.
const GRAPHILE_WORKER_SCHEMA = "graphile_worker";
const CLOUD_APP_ROLE = "cloud_app";
const CLOUD_APP_POLICY = "cloud_app_full_access";

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
  /**
   * Which errors from `probe` mean "not ready yet" rather than fatal. Defaults to
   * `isRetryableConnectionError`; `wait-for-ready.ts` widens this to also retry the schema not
   * being at the expected version yet, and the app role's own connection not being ready yet.
   */
  isRetryable?: (error: unknown) => boolean;
}

/**
 * Calls `probe` until it resolves, retrying only retryable failures (`isRetryable`, defaulting to
 * `isRetryableConnectionError`) on `intervalMs` until `budgetSeconds` has elapsed, then rejects
 * with the last such error. Any non-retryable error from `probe` is rethrown immediately, without
 * waiting.
 */
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

// postgres.js reads a connect timeout of 0 as "no timeout", so a probe made with the budget
// already spent still gets a short timeout instead of an unbounded one.
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
 * Grants `cloud_app` a policy matching the unrestricted access its owner already has on every one
 * of graphile-worker's own tables that has row-level security enabled (its job, queue, task, and
 * cron bookkeeping tables). graphile-worker enables row-level security on these with no policy of
 * its own, which Postgres reads as deny-all for every role except the table's owner: without this,
 * `cloud_app` would hold the table grants below yet still be refused every row by row-level
 * security itself, the moment it is not also the owning (migrating) role.
 */
async function grantCloudAppGraphileWorkerRowSecurityAccess(sql: postgres.Sql): Promise<void> {
  // Only a missing policy is created, never an existing one dropped and re-created: the previous
  // deployment keeps serving as `cloud_app` while this runs, and would be refused every row in
  // between.
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

/**
 * Grants `cloud_app` ordinary read/write on graphile-worker's own schema: unlike `audit_log`,
 * nothing here needs to be append-only, since it is job-queue bookkeeping, not an audit trail.
 */
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
 * Builds the same SCRAM-SHA-256 verifier Postgres itself stores for a password (RFC 5802, RFC
 * 7677), so `ALTER ROLE` only ever receives the verifier: Postgres writes a failing statement's
 * text to its log, and a plaintext password there would outlive the statement. The password's
 * UTF-8 bytes are used as they are, without SASLprep, the same way postgres.js computes its side
 * of the exchange when the cloud logs in.
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
 * `ALTER ROLE ... PASSWORD` takes a plain string constant, not a bind parameter, so the verifier
 * cannot be substituted directly into that statement the way every other value here is. Instead,
 * `format('%L', ...)` — an ordinary function call, which does accept a bind parameter — builds an
 * already safely quoted statement, and only that finished statement is executed.
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
 * graphile-worker warns and installs error handlers of its own on a pool it is given without both
 * an `error` and a `connect` listener; a client that fails with no `error` listener at all would
 * crash the process instead of failing the migration.
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
 * Runs pending migrations against `databaseUrl`. This is the pre-deploy command: it runs before
 * the new deployment takes traffic, never at application startup (see server.ts), so a migration
 * failure stops the deploy instead of starting a worker against an unmigrated schema.
 *
 * A database created in the same deploy is not immediately ready to accept connections, so this
 * first waits, within a bounded budget, until the database responds to a trivial query before
 * running any migration.
 *
 * Runs as the role that owns the schema (never `cloud_app`): besides the drizzle migrations
 * (which create `cloud_app` and its grants, see migrations/0016), this also runs
 * graphile-worker's own schema migrations — graphile-worker would otherwise install its schema
 * lazily when it starts, which would require the running application to hold DDL privileges —
 * grants `cloud_app` what it needs on that schema, and sets `cloud_app`'s login password so the
 * application can connect as it afterward.
 */
export async function runMigrations(
  databaseUrl: string,
  cloudAppPassword: string,
  options: RunMigrationsOptions = {},
): Promise<void> {
  const migrationsFolder = options.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER;
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
