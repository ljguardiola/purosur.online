import { randomUUID } from "node:crypto";
import { RECOVERY_DESTINATION_ADDRESS_LIMIT } from "@purosur/domain";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import pg from "pg";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { UNREACHABLE_WSFE_ENDPOINT } from "../fiscal/test-support/fake-wsfe-server.js";
import {
  auditLog,
  recoveryRejectedAttemptAccumulator,
  recoveryTokens,
  users,
} from "../platform/db/schema.js";
import { EDGE_ORIGIN_SECRET_HEADER } from "../platform/edge-origin-guard.js";
import { type RecoveryInfrastructure, setUpRecovery, startServer } from "../server.js";
import { VALID_ARCA_CERTIFICATE } from "../test-support/arca-certificate-fixtures.js";
import { TEST_EDGE_ORIGIN_SECRET } from "../test-support/build-test-app.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import type { AccessEmailSender, SendRecoveryLinkInput } from "./recovery-email-sender.js";
import { hashDestinationAddress } from "./recovery-rate-limiter.js";
import { hashRecoveryToken } from "./recovery-token-hash.js";
import { RECOVERY_REQUEST_TASK_IDENTIFIER } from "./recovery-worker.js";
import { findFreePort } from "./test-support/find-free-port.js";

// Proves the real production wiring end to end (a real postgres-js pool and graphile-worker's
// real run()), which PGlite cannot exercise: no LISTEN/NOTIFY, and every query on one connection.
const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const WAIT_OPTIONS = { timeout: 20_000, interval: 100 };
const NOW = new Date("2026-01-05T12:00:00.000Z");

/**
 * pg-pool reaps an idle connection after ten seconds by default, racing the drain wait below.
 * `idleTimeoutMillis: 0` disables that reaper, until this test cuts the connection itself.
 */
function createNonReapingJobQueuePool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, idleTimeoutMillis: 0 });
}

class FakeRecoveryEmailSender implements AccessEmailSender {
  readonly sent: SendRecoveryLinkInput[] = [];
  private failuresRemaining: number;

  constructor(failuresRemaining = 0) {
    this.failuresRemaining = failuresRemaining;
  }

  async sendRecoveryLink(input: SendRecoveryLinkInput): Promise<void> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("fake sender: simulated delivery failure");
    }
    this.sent.push(input);
  }

  async sendFirstPinCode(): Promise<void> {}
}

let integrationDb: IntegrationDatabase;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("recovery_request_wiring");
}, 60_000);

afterAll(async () => {
  await integrationDb.close();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function seedActiveUser(databaseUrl: string, email: string): Promise<string> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const db = drizzle(sql);
    const [user] = await db
      .insert(users)
      .values({ firstName: "Ada Lovelace", email, locationId: await seededLocationId(db) })
      .returning({ id: users.id });
    if (!user) {
      throw new Error("test setup: seeding the active user returned no row");
    }
    return user.id;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

async function countQueuedRecoveryJobs(databaseUrl: string): Promise<number> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const rows = await sql<{ count: number }[]>`
      select count(*)::int as count
      from graphile_worker.jobs
      where task_identifier = ${RECOVERY_REQUEST_TASK_IDENTIFIER}
    `;
    return rows[0]?.count ?? 0;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

interface StartedFixture {
  origin: string;
  advanceClock(ms: number): void;
  close(): Promise<void>;
}

const JOB_QUEUE_FAILURE = /recovery job queue: (idle|active) database client failed/;
const WORKER_FAILURE = /recovery worker: (idle|active) database client failed/;

async function dropEveryConnection(databaseUrl: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql`
      select pg_terminate_backend(pid)
      from pg_stat_activity
      where datname = current_database() and pid <> pg_backend_pid()
    `;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

async function rethrowAfter(error: unknown, cleanup: () => Promise<void>): Promise<never> {
  try {
    await cleanup();
  } catch (cleanupError) {
    throw new AggregateError([error, cleanupError], "cleanup after failure also failed");
  }
  throw error;
}

async function startRealServer(
  databaseUrl: string,
  emailSender: AccessEmailSender,
  createJobQueuePool?: (connectionString: string) => pg.Pool,
): Promise<StartedFixture> {
  const port = await findFreePort();
  let currentTime = NOW.getTime();
  let recovery: RecoveryInfrastructure | undefined;
  let app: Awaited<ReturnType<typeof startServer>>;
  try {
    app = await startServer(
      {
        PORT: String(port),
        DATABASE_URL: databaseUrl,
        RESEND_API_KEY: "unused-a-fake-sender-is-injected-below",
        RECOVERY_EMAIL_FROM: "Puro Sur <acceso@mail.staging.purosur.online>",
        RECOVERY_EMAIL_REPLY_TO: "purosur.comarca@gmail.com",
        BACKOFFICE_ORIGIN,
        EDGE_ORIGIN_SECRET: TEST_EDGE_ORIGIN_SECRET,
        ARCA_CERTIFICATE: VALID_ARCA_CERTIFICATE,
        ARCA_ENVIRONMENT: "production",
        DEVICE_TOKEN_ROTATION_KEY: TEST_DEVICE_TOKEN_ROTATION_KEY.toString("base64"),
        INSTALLATION_KEYS_ENCRYPTION_KEY: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY.toString("base64"),
      },
      {
        now: () => new Date(currentTime),
        setUpRecovery: async (recoveryEnv, now) => {
          recovery = await setUpRecovery(
            { ...recoveryEnv, arcaVitality: { endpoint: UNREACHABLE_WSFE_ENDPOINT } },
            now,
            {
              emailSender,
              createJobQueuePool,
            },
          );
          return recovery;
        },
      },
    );
  } catch (error) {
    // `recovery` can be set even though `startServer` never returned (e.g. `app.listen` failing
    // after setup resolved), which would otherwise leave its worker running with no close() called.
    await rethrowAfter(error, () => (recovery ? recovery.close() : Promise.resolve()));
  }
  return {
    origin: `http://127.0.0.1:${port}`,
    advanceClock(ms) {
      currentTime += ms;
    },
    close() {
      return app.close();
    },
  };
}

function postRecoveryRequest(origin: string, email: string): Promise<Response> {
  return fetch(`${origin}/api/account-recoveries`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: BACKOFFICE_ORIGIN,
      [EDGE_ORIGIN_SECRET_HEADER]: TEST_EDGE_ORIGIN_SECRET,
    },
    body: JSON.stringify({ email }),
  });
}

describe("setUpRecovery wired to a real Postgres pool and a real graphile-worker run()", () => {
  it("hands graphile-worker pools that report their own dropped connections, so graphile installs none of its own", async () => {
    const warnings: string[] = [];
    const reports: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      reports.push(args.map(String).join(" "));
    });

    const server = await startRealServer(
      integrationDb.databaseUrl,
      new FakeRecoveryEmailSender(),
      createNonReapingJobQueuePool,
    );

    try {
      // graphile-worker's own warning text for a pool missing an error or connect listener.
      expect(warnings.filter((warning) => /doesn't have|err\.red/.test(warning))).toEqual([]);

      // Waited out before the connection cut below, since later tests share this database and
      // count every queued job in it.
      const enqueued = await postRecoveryRequest(
        server.origin,
        `dropped-${randomUUID()}@example.com`,
      );
      expect(enqueued.status).toBe(200);
      await vi.waitFor(async () => {
        expect(await countQueuedRecoveryJobs(integrationDb.databaseUrl)).toBe(0);
      }, WAIT_OPTIONS);

      await dropEveryConnection(integrationDb.databaseUrl);

      await vi.waitFor(() => {
        expect(reports.filter((report) => JOB_QUEUE_FAILURE.test(report))).not.toEqual([]);
        expect(reports.filter((report) => WORKER_FAILURE.test(report))).not.toEqual([]);
      }, WAIT_OPTIONS);
    } finally {
      await server.close();
    }
  });

  it("delivers exactly one recovery email whose link fragment hashes to the stored token, and audits it", async () => {
    const email = `ada-${randomUUID()}@example.com`;
    const userId = await seedActiveUser(integrationDb.databaseUrl, email);
    const sender = new FakeRecoveryEmailSender();
    const server = await startRealServer(integrationDb.databaseUrl, sender);

    try {
      const response = await postRecoveryRequest(server.origin, email);
      expect(response.status).toBe(200);

      await vi.waitFor(() => {
        expect(sender.sent).toHaveLength(1);
      }, WAIT_OPTIONS);

      const [sent] = sender.sent;
      if (!sent) {
        throw new Error("test setup: expected exactly one sent email");
      }
      expect(sent.to).toBe(email);
      const fragment = sent.link.split("#")[1];
      if (!fragment) {
        throw new Error("test setup: expected the recovery link to carry a URL fragment");
      }

      const sql = postgres(integrationDb.databaseUrl, { max: 1 });
      try {
        const db = drizzle(sql);
        const [tokenRow] = await db
          .select({ tokenHash: recoveryTokens.tokenHash, issuedAt: recoveryTokens.issuedAt })
          .from(recoveryTokens)
          .where(eq(recoveryTokens.userId, userId));
        expect(tokenRow?.tokenHash).toBe(hashRecoveryToken(fragment));
        expect(tokenRow?.issuedAt).toEqual(NOW);

        const auditRows = await db.select().from(auditLog).where(eq(auditLog.actorId, userId));
        expect(auditRows).toHaveLength(1);
        expect(auditRows[0]?.entity).toBe("recovery_token");
      } finally {
        await sql.end({ timeout: 1 });
      }
    } finally {
      await server.close();
    }
  });

  it("processes an unknown address's job without writing a token, an audit row, or an email", async () => {
    const unknownEmail = `unknown-${randomUUID()}@example.com`;
    const sender = new FakeRecoveryEmailSender();
    const server = await startRealServer(integrationDb.databaseUrl, sender);

    try {
      const [tokensBefore, auditBefore] = await Promise.all([
        countRows(integrationDb.databaseUrl, "recovery_tokens"),
        countRows(integrationDb.databaseUrl, "audit_log"),
      ]);

      const response = await postRecoveryRequest(server.origin, unknownEmail);
      expect(response.status).toBe(200);

      await vi.waitFor(async () => {
        expect(await countQueuedRecoveryJobs(integrationDb.databaseUrl)).toBe(0);
      }, WAIT_OPTIONS);

      expect(sender.sent).toHaveLength(0);
      expect(await countRows(integrationDb.databaseUrl, "recovery_tokens")).toBe(tokensBefore);
      expect(await countRows(integrationDb.databaseUrl, "audit_log")).toBe(auditBefore);
    } finally {
      await server.close();
    }
  });

  it("sends no link for an over-limit request, enqueues no job for it, and upserts the rejected-attempt accumulator instead", async () => {
    const email = `ada-limit-${randomUUID()}@example.com`;
    const userId = await seedActiveUser(integrationDb.databaseUrl, email);
    const sender = new FakeRecoveryEmailSender();
    const server = await startRealServer(integrationDb.databaseUrl, sender);

    try {
      // Waited out one at a time: the worker runs two jobs at once, and an out-of-order commit
      // would supersede a link instead of hitting the over-limit case this test is about.
      for (let i = 0; i < RECOVERY_DESTINATION_ADDRESS_LIMIT; i++) {
        server.advanceClock(1000);
        expect((await postRecoveryRequest(server.origin, email)).status).toBe(200);
        await vi.waitFor(() => {
          expect(sender.sent).toHaveLength(i + 1);
        }, WAIT_OPTIONS);
      }
      server.advanceClock(1000);
      expect((await postRecoveryRequest(server.origin, email)).status).toBe(429);

      await vi.waitFor(async () => {
        expect(await countQueuedRecoveryJobs(integrationDb.databaseUrl)).toBe(0);
      }, WAIT_OPTIONS);

      expect(sender.sent).toHaveLength(RECOVERY_DESTINATION_ADDRESS_LIMIT);
      const sql = postgres(integrationDb.databaseUrl, { max: 1 });
      try {
        const db = drizzle(sql);
        const auditRows = await db
          .select()
          .from(auditLog)
          .where(and(eq(auditLog.entity, "user"), eq(auditLog.actorId, userId)));
        expect(auditRows).toEqual([]);

        const accumulatorRows = await db
          .select()
          .from(recoveryRejectedAttemptAccumulator)
          .where(eq(recoveryRejectedAttemptAccumulator.keyHash, hashDestinationAddress(email)));
        expect(accumulatorRows).toHaveLength(1);
        expect(accumulatorRows[0]).toMatchObject({ kind: "request", count: 1 });
      } finally {
        await sql.end({ timeout: 1 });
      }
    } finally {
      await server.close();
    }
  });

  it("retries a send that fails once through graphile-worker's own retry, and eventually delivers it", async () => {
    const email = `ada-retry-${randomUUID()}@example.com`;
    await seedActiveUser(integrationDb.databaseUrl, email);
    const sender = new FakeRecoveryEmailSender(1);
    const server = await startRealServer(integrationDb.databaseUrl, sender);

    try {
      const response = await postRecoveryRequest(server.origin, email);
      expect(response.status).toBe(200);

      await vi.waitFor(() => {
        expect(sender.sent).toHaveLength(1);
      }, WAIT_OPTIONS);
      expect(sender.sent[0]?.to).toBe(email);
    } finally {
      await server.close();
    }
  });
});

async function countRows(databaseUrl: string, table: string): Promise<number> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const rows = await sql<{ count: number }[]>`select count(*)::int as count from ${sql(table)}`;
    return rows[0]?.count ?? 0;
  } finally {
    await sql.end({ timeout: 1 });
  }
}
