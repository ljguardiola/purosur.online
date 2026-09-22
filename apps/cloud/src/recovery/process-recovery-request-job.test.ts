import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditLog, recoveryTokens, users } from "../db/schema.js";
import { processRecoveryRequestJob } from "./process-recovery-request-job.js";
import type { RecoveryEmailSender } from "./recovery-email-sender.js";

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

function fakeEmailSender(): RecoveryEmailSender & { sentLinks: string[] } {
  const sentLinks: string[] = [];
  return {
    sentLinks,
    async sendRecoveryLink(input) {
      sentLinks.push(input.link);
    },
  };
}

const NOW = new Date("2026-01-05T12:00:00.000Z");

describe("processRecoveryRequestJob", () => {
  it("does nothing when no active account matches the email", async () => {
    const emailSender = fakeEmailSender();

    await processRecoveryRequestJob(
      db,
      { email: "unknown@example.com" },
      {
        now: () => NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      },
    );

    await expect(db.select().from(recoveryTokens)).resolves.toEqual([]);
    await expect(db.select().from(auditLog)).resolves.toEqual([]);
    expect(emailSender.sentLinks).toEqual([]);
  });

  it("does nothing for a deactivated account", async () => {
    await insertUser("ada@example.com", false);
    const emailSender = fakeEmailSender();

    await processRecoveryRequestJob(
      db,
      { email: "ada@example.com" },
      {
        now: () => NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      },
    );

    await expect(db.select().from(recoveryTokens)).resolves.toEqual([]);
    expect(emailSender.sentLinks).toEqual([]);
  });

  it("issues a hashed token, expiring in 15 minutes, audits it, and emails the link", async () => {
    const userId = await insertUser("ada@example.com");
    const emailSender = fakeEmailSender();

    await processRecoveryRequestJob(
      db,
      { email: "ada@example.com" },
      {
        now: () => NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      },
    );

    const tokens = await db.select().from(recoveryTokens);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      userId,
      issuedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 15 * 60 * 1000),
      usedAt: null,
      voidedAt: null,
    });

    expect(emailSender.sentLinks).toHaveLength(1);
    const link = mustExist(emailSender.sentLinks[0], "the email sender to receive one link");
    expect(link).toMatch(/^https:\/\/staging\.purosur\.online\/recuperar\/enlace#.+$/);
    const rawToken = mustExist(link.split("#")[1], "the link to carry a token fragment");
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

  it("voids any previous live token for the account when issuing a new one", async () => {
    const userId = await insertUser("ada@example.com");
    const emailSender = fakeEmailSender();

    await processRecoveryRequestJob(
      db,
      { email: "ada@example.com" },
      {
        now: () => NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      },
    );
    const firstToken = mustExist(
      (await db.select().from(recoveryTokens))[0],
      "the first recovery token row",
    );

    const later = new Date(NOW.getTime() + 60 * 1000);
    await processRecoveryRequestJob(
      db,
      { email: "ada@example.com" },
      {
        now: () => later,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      },
    );

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
  });

  it("does not void an already-used or already-voided token again", async () => {
    await insertUser("ada@example.com");
    const emailSender = fakeEmailSender();
    await processRecoveryRequestJob(
      db,
      { email: "ada@example.com" },
      {
        now: () => NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      },
    );
    const firstToken = mustExist(
      (await db.select().from(recoveryTokens))[0],
      "the first recovery token row",
    );
    const usedAt = new Date(NOW.getTime() + 30 * 1000);
    await db.update(recoveryTokens).set({ usedAt }).where(eq(recoveryTokens.id, firstToken.id));

    const later = new Date(NOW.getTime() + 60 * 1000);
    await processRecoveryRequestJob(
      db,
      { email: "ada@example.com" },
      {
        now: () => later,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      },
    );

    const reloadedFirst = mustExist(
      (await db.select().from(recoveryTokens).where(eq(recoveryTokens.id, firstToken.id)))[0],
      "the first token to still be there",
    );
    expect(reloadedFirst.usedAt).toEqual(usedAt);
    expect(reloadedFirst.voidedAt).toBeNull();
  });

  it("propagates the email sender's failure so graphile-worker retries the job", async () => {
    await insertUser("ada@example.com");
    const failingSender: RecoveryEmailSender = {
      sendRecoveryLink: vi.fn().mockRejectedValue(new Error("resend unavailable")),
    };

    await expect(
      processRecoveryRequestJob(
        db,
        { email: "ada@example.com" },
        {
          now: () => NOW,
          backofficeOrigin: "https://staging.purosur.online",
          emailSender: failingSender,
        },
      ),
    ).rejects.toThrow("resend unavailable");
  });
});
