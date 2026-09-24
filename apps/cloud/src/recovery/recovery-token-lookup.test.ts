import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { recoveryTokens, users } from "../db/schema.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { classifyRecoveryToken } from "./recovery-token-lookup.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let userId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();

  const [user] = await db
    .insert(users)
    .values({ firstName: "Ada", email: "ada@example.com", locationId: await seededLocationId(db) })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("seeding the test user returned no row");
  }
  userId = user.id;
});

describe("classifyRecoveryToken", () => {
  it("classifies an unknown hash as invalid", async () => {
    const result = await classifyRecoveryToken(db, "unknown-hash", NOON);

    expect(result.status).toBe("invalid");
  });

  it("classifies a live token as valid and returns its row", async () => {
    await db.insert(recoveryTokens).values({
      userId,
      tokenHash: "live-hash",
      issuedAt: NOON,
      expiresAt: new Date(NOON.getTime() + FIFTEEN_MINUTES_MS),
    });

    const result = await classifyRecoveryToken(db, "live-hash", NOON);

    expect(result.status).toBe("valid");
    expect(result.token?.userId).toBe(userId);
  });

  it("classifies an already-used token as burned", async () => {
    await db.insert(recoveryTokens).values({
      userId,
      tokenHash: "used-hash",
      issuedAt: NOON,
      expiresAt: new Date(NOON.getTime() + FIFTEEN_MINUTES_MS),
      usedAt: NOON,
    });

    const result = await classifyRecoveryToken(db, "used-hash", NOON);

    expect(result.status).toBe("burned");
  });

  it("returns the row of a burned or expired token so the attempt can be attributed", async () => {
    await db.insert(recoveryTokens).values([
      {
        userId,
        tokenHash: "burned-hash",
        issuedAt: NOON,
        expiresAt: new Date(NOON.getTime() + FIFTEEN_MINUTES_MS),
        usedAt: NOON,
      },
      { userId, tokenHash: "expired-hash", issuedAt: NOON, expiresAt: NOON },
    ]);

    const burned = await classifyRecoveryToken(db, "burned-hash", NOON);
    const expired = await classifyRecoveryToken(db, "expired-hash", NOON);

    expect(burned.token?.userId).toBe(userId);
    expect(expired.token?.userId).toBe(userId);
  });

  it("classifies a token voided by a newer request as burned", async () => {
    await db.insert(recoveryTokens).values({
      userId,
      tokenHash: "voided-hash",
      issuedAt: NOON,
      expiresAt: new Date(NOON.getTime() + FIFTEEN_MINUTES_MS),
      voidedAt: NOON,
    });

    const result = await classifyRecoveryToken(db, "voided-hash", NOON);

    expect(result.status).toBe("burned");
  });

  it("classifies a token past its expiry as expired", async () => {
    await db.insert(recoveryTokens).values({
      userId,
      tokenHash: "expired-hash",
      issuedAt: NOON,
      expiresAt: new Date(NOON.getTime() - 1),
    });

    const result = await classifyRecoveryToken(db, "expired-hash", NOON);

    expect(result.status).toBe("expired");
  });

  it("classifies a burned-and-expired token as burned, not expired", async () => {
    await db.insert(recoveryTokens).values({
      userId,
      tokenHash: "burned-and-expired-hash",
      issuedAt: NOON,
      expiresAt: new Date(NOON.getTime() - 1),
      usedAt: NOON,
    });

    const result = await classifyRecoveryToken(db, "burned-and-expired-hash", NOON);

    expect(result.status).toBe("burned");
  });
});
