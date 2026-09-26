import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import pg from "pg";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  auditLog,
  recoveryRejectedAttemptAccumulator,
  recoveryTokens,
  users,
} from "../db/schema.js";
import { EDGE_ORIGIN_SECRET_HEADER } from "../edge-origin-guard.js";
import { type RecoveryInfrastructure, setUpRecovery, startServer } from "../server.js";
import { VALID_ARCA_CERTIFICATE } from "../test-support/arca-certificate-fixtures.js";
import { TEST_EDGE_ORIGIN_SECRET } from "../test-support/build-test-app.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { findFreePort } from "./find-free-port.js";
import type { RecoveryEmailSender, SendRecoveryLinkInput } from "./recovery-email-sender.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "./recovery-integration-database.js";
import { hashDestinationAddress } from "./recovery-rate-limiter.js";
import { hashRecoveryToken } from "./recovery-token-hash.js";
import { RECOVERY_REQUEST_TASK_IDENTIFIER } from "./recovery-worker.js";

// Proves the real production wiring `server.ts`'s `setUpRecovery` builds — a real postgres-js
// pool and graphile-worker's real `run()` inside the cloud process — end to end, which PGlite
// cannot exercise (no LISTEN/NOTIFY, no advisory locks). The email sender is faked, and one test
// swaps in a job-queue pool that never reaps idle connections; every other seam (job enqueue, job
// processing, token issuance, auditing) runs for real.
const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const WAIT_OPTIONS = { timeout: 20_000, interval: 100 };

/**
 * pg-pool reaps an idle connection after ten seconds by default, which would race the drain wait
 * below against that timer. `idleTimeoutMillis: 0` disables that reaper, so the connection the
 * drained request leaves in the job-queue pool stays there — for however long the drain wait
 * takes — until this test cuts it itself.
 */
function createNonReapingJobQueuePool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, idleTimeoutMillis: 0 });
}

class FakeRecoveryEmailSender implements RecoveryEmailSender {
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
  close(): Promise<void>;
}

const JOB_QUEUE_FAILURE = /recovery job queue: (idle|active) database client failed/;
const WORKER_FAILURE = /recovery worker: (idle|active) database client failed/;

/** Cuts every connection both pools hold, the way a database restart or a failover does. */
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

/**
 * Runs `cleanup` after `error` so a failure never leaves a leak behind it, then reports the
 * failure that triggered it: both, joined, if `cleanup` itself throws, so neither is lost — or
 * `error` alone otherwise, unreplaced by whatever `cleanup` returned.
 */
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
  emailSender: RecoveryEmailSender,
  createJobQueuePool?: (connectionString: string) => pg.Pool,
): Promise<StartedFixture> {
  const port = await findFreePort();
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
      },
      {
        // The only seams touched: the email sender and, when a test passes one, the job-queue
        // pool. graphile-worker's run() and the routes are `setUpRecovery`'s real wiring.
        setUpRecovery: async (recoveryEnv) => {
          recovery = await setUpRecovery(recoveryEnv, { emailSender, createJobQueuePool });
          return recovery;
        },
      },
    );
  } catch (error) {
    // `recovery` can already be set here even though `startServer` never returned: a rejection
    // after its own setup resolved (e.g. `app.listen` failing) would otherwise leave its worker
    // running and polling this file's shared database with no `close()` ever called on it.
    await rethrowAfter(error, () => (recovery ? recovery.close() : Promise.resolve()));
  }
  return {
    origin: `http://127.0.0.1:${port}`,
    close() {
      return app.close();
    },
  };
}

function postRecoveryRequest(origin: string, email: string): Promise<Response> {
  return fetch(`${origin}/users/recovery/request`, {
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
      // graphile-worker warns, and then installs (and on release removes) its own handlers, for
      // every pool it is given that is missing an error or a connect listener.
      expect(warnings.filter((warning) => /doesn't have|err\.red/.test(warning))).toEqual([]);

      // What puts a connection of the job-queue pool under the cut below: a request enqueues
      // through that pool and only answers once its job is in. The job-queue pool this test
      // injects above never reaps that connection while idle, so this wait is free to take as
      // long as it needs without racing pg-pool's own idle timeout for it. The job is waited out
      // before the cut because the tests below share this database and count every job queued
      // in it.
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
          .select({ tokenHash: recoveryTokens.tokenHash })
          .from(recoveryTokens)
          .where(eq(recoveryTokens.userId, userId));
        expect(tokenRow?.tokenHash).toBe(hashRecoveryToken(fragment));

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
      // Each link is waited out before the next request: the worker runs two jobs at once, and a
      // newer request's job that commits its token first supersedes an older one, which then
      // sends nothing and audits the supersession — correct behavior, but not the over-limit
      // case this test is about.
      for (let i = 0; i < 5; i++) {
        expect((await postRecoveryRequest(server.origin, email)).status).toBe(200);
        await vi.waitFor(() => {
          expect(sender.sent).toHaveLength(i + 1);
        }, WAIT_OPTIONS);
      }
      expect((await postRecoveryRequest(server.origin, email)).status).toBe(429);

      await vi.waitFor(async () => {
        expect(await countQueuedRecoveryJobs(integrationDb.databaseUrl)).toBe(0);
      }, WAIT_OPTIONS);

      expect(sender.sent).toHaveLength(5);
      const sql = postgres(integrationDb.databaseUrl, { max: 1 });
      try {
        const db = drizzle(sql);
        // No individual audit row is written for the rejection: it is bookkept by the
        // accumulator instead and only turned into an audit row once its
        // hour window closes and the flush cron task runs.
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
