import { createHash, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLog, recoveryTokens, users } from "../db/schema.js";
import {
  processRecoveryRequestJob,
  type RecoveryRequestJobPayload,
} from "./process-recovery-request-job.js";

const MIGRATIONS_FOLDER = new URL("../../migrations", import.meta.url).pathname;

let client: PGlite;
let db: PgliteDatabase<Record<string, never>>;

beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterEach(async () => {
  await client.close();
});

function mustExist<T>(value: T | undefined | null, description: string): T {
  if (value === undefined || value === null) {
    throw new Error(`test setup: expected ${description}`);
  }
  return value;
}

async function insertUser(email: string, active = true): Promise<string> {
  const [row] = await db.insert(users).values({ firstName: "Ada", email, active }).returning({
    id: users.id,
  });
  return mustExist(row, "inserting the user to return a row").id;
}

const NOW = new Date("2026-01-05T12:00:00.000Z");

function request(email: string, requestedAt = NOW): RecoveryRequestJobPayload {
  return { email, requestedAt: requestedAt.toISOString(), requestId: randomUUID() };
}

function jobDeps(now = NOW) {
  return { now: () => now, backofficeOrigin: "https://staging.purosur.online" };
}

async function requestAuditRows() {
  return db.select().from(auditLog).where(eq(auditLog.entity, "user"));
}

describe("processRecoveryRequestJob", () => {
  it("does nothing when no active account matches the email", async () => {
    const result = await processRecoveryRequestJob(db, request("unknown@example.com"), jobDeps());

    await expect(db.select().from(recoveryTokens)).resolves.toEqual([]);
    await expect(db.select().from(auditLog)).resolves.toEqual([]);
    expect(result).toEqual({});
  });

  it("issues no token and returns nothing to send for a deactivated account, but audits the request", async () => {
    const userId = await insertUser("ada@example.com", false);

    const result = await processRecoveryRequestJob(db, request("ada@example.com"), jobDeps());

    await expect(db.select().from(recoveryTokens)).resolves.toEqual([]);
    expect(result).toEqual({});
    const auditRows = await requestAuditRows();
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      entityId: userId,
      actorId: userId,
      newValue: { attempt: "request", rejectedWith: "account_inactive" },
    });
  });

  it("stamps a deactivated-account audit row with the request time, not the job's run time (H4)", async () => {
    const requestedAt = new Date(NOW.getTime() - 10 * 60 * 1000);
    await insertUser("ada@example.com", false);

    await processRecoveryRequestJob(db, request("ada@example.com", requestedAt), jobDeps(NOW));

    const [auditRow] = await requestAuditRows();
    expect(mustExist(auditRow, "the account_inactive audit row").at).toEqual(requestedAt);
  });

  it("never voids a link issued for a newer request when an older request's job runs late", async () => {
    await insertUser("ada@example.com");
    const newerRequestAt = new Date(NOW.getTime() + 5 * 60 * 1000);
    await processRecoveryRequestJob(
      db,
      request("ada@example.com", newerRequestAt),
      jobDeps(newerRequestAt),
    );

    const lateRetryAt = new Date(NOW.getTime() + 7 * 60 * 1000);
    const lateResult = await processRecoveryRequestJob(
      db,
      request("ada@example.com", NOW),
      jobDeps(lateRetryAt),
    );

    const tokens = await db.select().from(recoveryTokens);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.voidedAt).toBeNull();
    expect(lateResult).toEqual({});
  });

  it("audits an admitted request whose job finds a link already issued for a newer request", async () => {
    const userId = await insertUser("ada@example.com");
    const newerRequestAt = new Date(NOW.getTime() + 5 * 60 * 1000);
    await processRecoveryRequestJob(
      db,
      request("ada@example.com", newerRequestAt),
      jobDeps(newerRequestAt),
    );

    const lateRunAt = new Date(NOW.getTime() + 7 * 60 * 1000);
    await processRecoveryRequestJob(db, request("ada@example.com", NOW), jobDeps(lateRunAt));

    const auditRows = await requestAuditRows();
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      entityId: userId,
      actorId: userId,
      newValue: { attempt: "request", rejectedWith: "superseded" },
    });
  });

  it("stamps a superseded audit row with the superseded request's own time, not the job's run time (H4)", async () => {
    await insertUser("ada@example.com");
    const newerRequestAt = new Date(NOW.getTime() + 5 * 60 * 1000);
    await processRecoveryRequestJob(
      db,
      request("ada@example.com", newerRequestAt),
      jobDeps(newerRequestAt),
    );

    const supersededRequestAt = NOW;
    const lateRunAt = new Date(NOW.getTime() + 7 * 60 * 1000);
    await processRecoveryRequestJob(
      db,
      request("ada@example.com", supersededRequestAt),
      jobDeps(lateRunAt),
    );

    const [auditRow] = await requestAuditRows();
    expect(mustExist(auditRow, "the superseded audit row").at).toEqual(supersededRequestAt);
  });

  it("issues no second link for a different request made in the same millisecond", async () => {
    await insertUser("ada@example.com");

    await processRecoveryRequestJob(db, request("ada@example.com"), jobDeps());
    await processRecoveryRequestJob(db, request("ada@example.com"), jobDeps());

    const tokens = await db.select().from(recoveryTokens);
    expect(tokens).toHaveLength(1);
  });

  it("never stores two live tokens for the same account", async () => {
    const userId = await insertUser("ada@example.com");
    const liveToken = (tokenHash: string) => ({
      userId,
      tokenHash,
      expiresAt: new Date(NOW.getTime() + 15 * 60 * 1000),
    });
    await db.insert(recoveryTokens).values(liveToken("first-live-hash"));

    await expect(db.insert(recoveryTokens).values(liveToken("second-live-hash"))).rejects.toThrow();
  });

  it("lets a retry of the same request replace the link that request already issued", async () => {
    await insertUser("ada@example.com");
    const requestPayload = request("ada@example.com");
    const first = await processRecoveryRequestJob(db, requestPayload, jobDeps());

    const retryAt = new Date(NOW.getTime() + 60 * 1000);
    const retry = await processRecoveryRequestJob(db, requestPayload, jobDeps(retryAt));

    const tokens = await db.select().from(recoveryTokens);
    expect(tokens).toHaveLength(2);
    expect(tokens.filter((token) => token.voidedAt === null)).toHaveLength(1);
    expect(first.send).toBeDefined();
    expect(retry.send).toBeDefined();
  });

  it("issues a hashed token, expiring in 15 minutes, audits it, and returns the link to send", async () => {
    const userId = await insertUser("ada@example.com");

    const result = await processRecoveryRequestJob(db, request("ada@example.com"), jobDeps());

    const tokens = await db.select().from(recoveryTokens);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      userId,
      issuedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 15 * 60 * 1000),
      usedAt: null,
      voidedAt: null,
    });

    const send = mustExist(result.send, "a link to send");
    expect(send.to).toBe("ada@example.com");
    expect(send.link).toMatch(/^https:\/\/staging\.purosur\.online\/recuperar\/enlace#.+$/);
    const rawToken = mustExist(send.link.split("#")[1], "the link to carry a token fragment");
    // The link's fragment carries the raw token; the row only ever stores its hash.
    const expectedHash = createHash("sha256").update(rawToken).digest("base64url");
    const token = mustExist(tokens[0], "one recovery token row");
    expect(token.tokenHash).toBe(expectedHash);
    expect(token.tokenHash).not.toContain(rawToken);

    const auditRows = await db.select().from(auditLog);
    expect(auditRows).toHaveLength(1);
    const auditRow = mustExist(auditRows[0], "one audit_log row");
    expect(auditRow).toMatchObject({
      entity: "recovery_token",
      entityId: token.id,
      actorId: userId,
      previousValue: null,
    });
    // The audit trail never carries the token or its hash, only when it was issued and expires.
    expect(JSON.stringify(auditRow.newValue)).not.toContain(rawToken);
    expect(JSON.stringify(auditRow.newValue)).not.toContain(token.tokenHash);
  });

  it("stamps the token-issuance audit row with the request time, not the job's run time (H4)", async () => {
    const requestedAt = new Date(NOW.getTime() - 3 * 60 * 1000);
    await insertUser("ada@example.com");

    await processRecoveryRequestJob(db, request("ada@example.com", requestedAt), jobDeps(NOW));

    const [auditRow] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entity, "recovery_token"));
    expect(mustExist(auditRow, "the token-issuance audit row").at).toEqual(requestedAt);
  });

  it("voids any previous live token for the account when issuing a new one", async () => {
    const userId = await insertUser("ada@example.com");

    const first = await processRecoveryRequestJob(db, request("ada@example.com"), jobDeps());
    const firstToken = mustExist(
      (await db.select().from(recoveryTokens))[0],
      "the first recovery token row",
    );

    const later = new Date(NOW.getTime() + 60 * 1000);
    await processRecoveryRequestJob(db, request("ada@example.com", later), jobDeps(later));

    const tokensById = new Map(
      (await db.select().from(recoveryTokens)).map((token) => [token.id, token]),
    );
    expect(tokensById.size).toBe(2);
    expect(tokensById.get(firstToken.id)?.voidedAt).toEqual(later);
    const secondTokenId = mustExist(
      [...tokensById.keys()].find((id) => id !== firstToken.id),
      "a second token id",
    );
    expect(tokensById.get(secondTokenId)?.voidedAt).toBeNull();
    expect(tokensById.get(secondTokenId)?.userId).toBe(userId);
    expect(first.send).toBeDefined();
  });

  it("does not void an already-used or already-voided token again", async () => {
    await insertUser("ada@example.com");
    await processRecoveryRequestJob(db, request("ada@example.com"), jobDeps());
    const firstToken = mustExist(
      (await db.select().from(recoveryTokens))[0],
      "the first recovery token row",
    );
    const usedAt = new Date(NOW.getTime() + 30 * 1000);
    await db.update(recoveryTokens).set({ usedAt }).where(eq(recoveryTokens.id, firstToken.id));

    const later = new Date(NOW.getTime() + 60 * 1000);
    await processRecoveryRequestJob(db, request("ada@example.com", later), jobDeps(later));

    const reloadedFirst = mustExist(
      (await db.select().from(recoveryTokens).where(eq(recoveryTokens.id, firstToken.id)))[0],
      "the first token to still be there",
    );
    expect(reloadedFirst.usedAt).toEqual(usedAt);
    expect(reloadedFirst.voidedAt).toBeNull();
  });
});
