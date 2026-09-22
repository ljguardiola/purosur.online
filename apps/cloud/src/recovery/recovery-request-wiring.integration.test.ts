import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  auditLog,
  recoveryRejectedAttemptAccumulator,
  recoveryTokens,
  users,
} from "../db/schema.js";
import { setUpRecovery, startServer } from "../server.js";
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
// cannot exercise (no LISTEN/NOTIFY, no advisory locks). Only the email sender is faked; every
// other seam (job enqueue, job processing, token issuance, auditing) runs for real.
const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const WAIT_OPTIONS = { timeout: 20_000, interval: 100 };

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

async function seedActiveUser(databaseUrl: string, email: string): Promise<string> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const db = drizzle(sql);
    const [user] = await db
      .insert(users)
      .values({ firstName: "Ada Lovelace", email })
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

async function startRealServer(
  databaseUrl: string,
  emailSender: RecoveryEmailSender,
): Promise<StartedFixture> {
  const port = await findFreePort();
  const app = await startServer(
    {
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      RESEND_API_KEY: "unused-a-fake-sender-is-injected-below",
      RECOVERY_EMAIL_FROM: "Puro Sur <acceso@mail.staging.purosur.online>",
      RECOVERY_EMAIL_REPLY_TO: "purosur.comarca@gmail.com",
      BACKOFFICE_ORIGIN,
    },
    {
      // The only seam this test touches: everything else (the pool, graphile-worker's run(),
      // the routes) is `setUpRecovery`'s real production wiring, unmodified.
      setUpRecovery: (recoveryEnv) => setUpRecovery(recoveryEnv, { emailSender }),
    },
  );
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => app.close(),
  };
}

function postRecoveryRequest(origin: string, email: string): Promise<Response> {
  return fetch(`${origin}/users/recovery/request`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BACKOFFICE_ORIGIN },
    body: JSON.stringify({ email }),
  });
}

describe("setUpRecovery wired to a real Postgres pool and a real graphile-worker run()", () => {
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
    await seedActiveUser(integrationDb.databaseUrl, email);
    const sender = new FakeRecoveryEmailSender();
    const server = await startRealServer(integrationDb.databaseUrl, sender);

    try {
      for (let i = 0; i < 5; i++) {
        expect((await postRecoveryRequest(server.origin, email)).status).toBe(200);
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
        // accumulator instead (issue #167 T5, H1) and only turned into an audit row once its
        // hour window closes and the flush cron task runs.
        const auditRows = await db.select().from(auditLog).where(eq(auditLog.entity, "user"));
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
