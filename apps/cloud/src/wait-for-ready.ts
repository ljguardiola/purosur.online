import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { describeDatabaseFailure, errorCode } from "./db/describe-database-failure.js";
import {
  isRetryableConnectionError,
  probeConnectTimeoutSeconds,
  waitForDatabase,
} from "./migrate.js";

export interface WaitForReadyOptions {
  migrationsFolder?: string;
  /** Kept short in tests so an unreachable database fails fast instead of hanging. */
  connectTimeoutSeconds?: number;
  /** Total time budget to wait for the schema to reach the version bundled in this image. */
  waitForReadySeconds?: number;
  /** Interval between readiness probes while waiting. */
  waitIntervalMs?: number;
  /** Injected in tests so waiting does not consume real time. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onWaiting?: (error: unknown, elapsedMs: number) => void;
}

const DEFAULT_MIGRATIONS_FOLDER = new URL("../migrations", import.meta.url).pathname;
const DEFAULT_WAIT_FOR_READY_SECONDS = 60;
const DEFAULT_WAIT_INTERVAL_MS = 1000;
const GRAPHILE_WORKER_SCHEMA = "graphile_worker";

const NOT_READY_CODE = "SCHEMA_NOT_READY";

function notReadyError(reason: string): Error & { code: string } {
  return Object.assign(new Error(`wait-for-ready: not ready yet: ${reason}`), {
    code: NOT_READY_CODE,
  });
}

// A role or database this early in a deploy can be missing altogether (28000, invalid_authorization
// specification), its password not set yet (28P01, invalid_password), or the schema it needs not
// created yet: the schema itself missing (3F000, invalid_schema_name), one of its tables missing
// (42P01, undefined_table), or no grant on it yet (42501, insufficient_privilege). Every one of
// these is exactly what "the migrate step has not finished yet" looks like from `cloud_app`'s own
// connection, so all of them count as not ready rather than fatal.
const NOT_MIGRATED_YET_ERROR_CODES = new Set(["28000", "28P01", "3F000", "42P01", "42501"]);

export function isNotMigratedYetError(error: unknown): boolean {
  const code = errorCode(error);
  return code !== undefined && NOT_MIGRATED_YET_ERROR_CODES.has(code);
}

function isRetryableReadyError(error: unknown): boolean {
  return (
    isRetryableConnectionError(error) ||
    isNotMigratedYetError(error) ||
    errorCode(error) === NOT_READY_CODE
  );
}

interface ExpectedMigrationRecord {
  tag: string;
  hash: string;
  createdAt: number;
}

interface JournalEntry {
  tag: string;
  when: number;
}

/**
 * Reads the same `meta/_journal.json` drizzle's own migrator reads, and hashes each migration
 * file the same way it does (`readMigrationFiles` in `drizzle-orm/migrator`): the full file
 * content's sha256, matched against `drizzle.__drizzle_migrations`'s own `hash` column.
 */
function readExpectedMigrationRecords(migrationsFolder: string): ExpectedMigrationRecord[] {
  const journalPath = `${migrationsFolder}/meta/_journal.json`;
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: JournalEntry[] };
  return journal.entries.map((entry) => {
    const migrationSql = readFileSync(`${migrationsFolder}/${entry.tag}.sql`, "utf8");
    return {
      tag: entry.tag,
      hash: createHash("sha256").update(migrationSql).digest("hex"),
      createdAt: entry.when,
    };
  });
}

async function checkDrizzleMigrationsApplied(
  sql: postgres.Sql,
  migrationsFolder: string,
): Promise<void> {
  const expected = readExpectedMigrationRecords(migrationsFolder);

  let rows: { hash: string; created_at: string }[];
  try {
    rows = await sql`select hash, created_at from drizzle.__drizzle_migrations`;
  } catch (error) {
    if (isNotMigratedYetError(error)) {
      throw notReadyError("the drizzle migrations table is not there yet");
    }
    throw error;
  }

  const applied = new Set(rows.map((row) => `${row.hash}:${Number(row.created_at)}`));
  for (const record of expected) {
    if (!applied.has(`${record.hash}:${record.createdAt}`)) {
      throw notReadyError(`migration ${record.tag} is not applied yet`);
    }
  }
}

async function checkGraphileWorkerMigrated(sql: postgres.Sql): Promise<void> {
  let rows: { count: number }[];
  try {
    rows = await sql`select count(*)::int as count from ${sql(GRAPHILE_WORKER_SCHEMA)}.migrations`;
  } catch (error) {
    if (isNotMigratedYetError(error)) {
      throw notReadyError("graphile-worker's schema is not installed yet");
    }
    throw error;
  }
  if ((rows[0]?.count ?? 0) === 0) {
    throw notReadyError("graphile-worker's migrations are not installed yet");
  }
}

async function checkSchemaReady(sql: postgres.Sql, migrationsFolder: string): Promise<void> {
  await checkDrizzleMigrationsApplied(sql, migrationsFolder);
  await checkGraphileWorkerMigrated(sql);
}

/**
 * Waits, within a bounded budget, until `databaseUrl` (the cloud's own `cloud_app` connection) is
 * ready to take traffic: every migration bundled in this image's `migrationsFolder` is recorded in
 * `drizzle.__drizzle_migrations`, and graphile-worker's own schema is installed. This is a
 * read-only check — `cloud_app` has no privilege to apply any of it — meant to run before the
 * deploy takes traffic, while a separate one-shot service migrates the database as the admin role.
 *
 * A connection failure that means "not created or not ready yet" (the role or its password not
 * set up yet, the schema not there yet) is retried instead of failing the deploy immediately; any
 * other error is fatal right away.
 */
export async function waitForReady(
  databaseUrl: string,
  options: WaitForReadyOptions = {},
): Promise<void> {
  const migrationsFolder = options.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER;
  const connectTimeoutSeconds = options.connectTimeoutSeconds ?? 10;

  await waitForDatabase(
    async (remainingMs) => {
      const sql = postgres(databaseUrl, {
        max: 1,
        connect_timeout: probeConnectTimeoutSeconds(remainingMs, connectTimeoutSeconds),
      });
      try {
        await checkSchemaReady(sql, migrationsFolder);
      } finally {
        await sql.end({ timeout: 1 });
      }
    },
    {
      budgetSeconds: options.waitForReadySeconds ?? DEFAULT_WAIT_FOR_READY_SECONDS,
      intervalMs: options.waitIntervalMs ?? DEFAULT_WAIT_INTERVAL_MS,
      sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
      now: options.now ?? Date.now,
      onWaiting: options.onWaiting ?? logWaiting,
      isRetryable: isRetryableReadyError,
    },
  );
}

function logWaiting(error: unknown, elapsedMs: number): void {
  console.error(
    `wait-for-ready: not ready yet after ${Math.round(elapsedMs / 1000)}s (${errorCode(error)}), retrying...`,
  );
}

const isMainModule =
  process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("wait-for-ready: DATABASE_URL is not set");
    process.exit(1);
  } else {
    waitForReady(databaseUrl)
      .then(() => {
        console.log("wait-for-ready: ready");
      })
      .catch((error: unknown) => {
        console.error(`wait-for-ready: gave up waiting: ${describeDatabaseFailure(error)}`);
        process.exit(1);
      });
  }
}
