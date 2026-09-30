import { randomUUID } from "node:crypto";
import { redeemPinCode } from "@purosur/domain/access/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  changes,
  pinCodeRedemptionAttempts,
  userPinCodes,
  userPins,
  users,
} from "../platform/db/schema.js";
import { hashSecretCode } from "../platform/secret-code.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { argon2PinHasher } from "./argon2-pin-hasher.js";
import { DrizzlePinCodeRedemptionStore } from "./drizzle-pin-code-redemption-store.js";

// PGlite serializes every transaction, so racing redemptions can only interleave on a real
// Postgres pool.
const CODE = "P4NX7KWE2QRT6MZD";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("pin_code_redemption_race");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function redeem(input: {
  code: string;
  registerId: string;
  sourceAddress: string;
  newPin: string;
}) {
  const now = new Date();
  return redeemPinCode(
    {
      store: new DrizzlePinCodeRedemptionStore(db),
      clock: { now: () => now },
      hasher: argon2PinHasher(),
    },
    {
      codeHash: hashSecretCode(input.code),
      newPin: input.newPin,
      registerId: input.registerId,
      sourceAddress: input.sourceAddress,
    },
  );
}

async function insertUserWithCode(code: string): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Grace Hopper",
      email: `grace-${randomUUID()}@example.com`,
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  const issuedAt = new Date();
  await db.insert(userPinCodes).values({
    userId: user.id,
    codeHash: hashSecretCode(code),
    issuedBy: user.id,
    issuedAt,
    expiresAt: new Date(issuedAt.getTime() + 15 * 60 * 1000),
  });
  return user.id;
}

describe("redeeming the same PIN code twice at once on a real Postgres", () => {
  it("redeems it once and answers the other burned, leaving the first PIN and one user change", async () => {
    const userId = await insertUserWithCode(CODE);

    const [first, second] = await runQueuedBehindHeldLock(
      sql,
      (holder) =>
        holder`select id from user_pin_codes where code_hash = ${hashSecretCode(CODE)} for update`,
      () =>
        redeem({
          code: CODE,
          registerId: randomUUID(),
          sourceAddress: "203.0.113.1",
          newPin: "111111",
        }),
      () =>
        redeem({
          code: CODE,
          registerId: randomUUID(),
          sourceAddress: "203.0.113.2",
          newPin: "222222",
        }),
    );

    expect([first.kind, second.kind].sort()).toEqual(["burned", "redeemed"]);
    const winner = first.kind === "redeemed" ? first : second;
    if (winner.kind !== "redeemed") {
      throw new Error("test setup: neither redemption succeeded");
    }
    expect(await db.select().from(userPins).where(eq(userPins.userId, userId))).toMatchObject([
      { salt: winner.salt, hash: winner.pinHash },
    ]);
    expect(await db.select().from(changes).where(eq(changes.entityId, userId))).toHaveLength(1);
    const [user] = await db
      .select({ version: users.version })
      .from(users)
      .where(eq(users.id, userId));
    expect(user?.version).toBe(2);
  });
});

describe("attempting redemptions from one register at once on a real Postgres", () => {
  it("lets only one of two attempts through when just one is left under the hourly cap", async () => {
    const registerId = randomUUID();
    const recentAttempt = new Date(Date.now() - 60 * 1000);
    await db.insert(pinCodeRedemptionAttempts).values(
      Array.from({ length: 9 }, () => ({
        keyKind: "register" as const,
        keyValue: registerId,
        attemptedAt: recentAttempt,
      })),
    );

    const outcomes = await Promise.all(
      ["203.0.113.11", "203.0.113.12"].map((sourceAddress) =>
        redeem({ code: "AAAAAAAAAAAAAAAA", registerId, sourceAddress, newPin: "123456" }),
      ),
    );

    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual([
      "rate_limited",
      "unknown_code",
    ]);
  });
});
