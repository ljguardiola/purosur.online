import { randomUUID } from "node:crypto";
import { emitFirstPinCode, redeemPinCode } from "@purosur/domain/credentials/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registers, userPinCodes, users } from "../platform/db/schema.js";
import { hashSecretCode } from "../platform/secret-code.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { argon2PinHasher } from "./argon2-pin-hasher.js";
import { DrizzleFirstPinCodeStore } from "./drizzle-first-pin-code-store.js";
import { DrizzlePinCodeRedemptionStore } from "./drizzle-pin-code-redemption-store.js";
import { generatePinCode } from "./pin-code-generator.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");

// PGlite serializes every transaction, so an emission can only wait on a redemption's lock on a
// real Postgres pool.
const CODE = "K3PX7WNE2QRT6MZD";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("first_pin_code_emission_race");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("asking for a first PIN code while the person redeems a code on a real Postgres", () => {
  it("answers pin_already_set to the emission that waited for the redemption, queueing nothing", async () => {
    const locationId = await seededLocationId(db);
    const [register] = await db
      .insert(registers)
      .values({ locationId, name: `Caja ${randomUUID()}` })
      .returning({ id: registers.id });
    const [user] = await db
      .insert(users)
      .values({ firstName: "Grace Hopper", email: `grace-${randomUUID()}@example.com`, locationId })
      .returning({ id: users.id, email: users.email });
    if (!register || !user) {
      throw new Error("test setup: seeding the register or the user returned no row");
    }
    const issuedAt = new Date();
    await db.insert(userPinCodes).values({
      userId: user.id,
      codeHash: hashSecretCode(CODE),
      issuedBy: null,
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + 15 * 60 * 1000),
    });
    const now = new Date();

    const [redemption, emission] = await runQueuedBehindHeldLock(
      sql,
      (holder) => holder`select id from users where id = ${user.id} for no key update`,
      () =>
        redeemPinCode(
          {
            store: new DrizzlePinCodeRedemptionStore(db),
            clock: { now: () => now },
            hasher: argon2PinHasher(),
          },
          {
            codeHash: hashSecretCode(CODE),
            newPin: "444444",
            registerId: register.id,
            sourceAddress: "203.0.113.31",
          },
        ),
      () =>
        emitFirstPinCode(
          {
            store: new DrizzleFirstPinCodeStore(db, () => NOON),
            clock: { now: () => now },
            codes: { generate: generatePinCode },
          },
          { registerId: register.id, userId: user.id },
        ),
    );

    expect(redemption.kind).toBe("redeemed");
    expect(emission).toEqual({ kind: "pin_already_set" });
    expect(
      await sql`select id from graphile_worker._private_jobs where payload->>'email' = ${user.email}`,
    ).toHaveLength(0);
    expect(
      await db.select().from(userPinCodes).where(eq(userPinCodes.userId, user.id)),
    ).toHaveLength(1);
  });
});
