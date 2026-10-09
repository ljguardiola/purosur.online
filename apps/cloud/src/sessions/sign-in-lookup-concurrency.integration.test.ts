import { randomUUID } from "node:crypto";
import { lookUpSignIn } from "@purosur/domain/sessions/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registers, signInLookupAttempts } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleSignInLookupStore } from "./drizzle-sign-in-lookup-store.js";

// PGlite serializes every transaction, so racing lookups can only interleave on a real
// Postgres pool.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("sign_in_lookup_race");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("looking up who signs in from one register at once on a real Postgres", () => {
  it("lets only one of two lookups through when just one is left under the hourly cap", async () => {
    const [register] = await db
      .insert(registers)
      .values({ locationId: await seededLocationId(db), name: "Caja 1" })
      .returning({ id: registers.id });
    if (!register) {
      throw new Error("test setup: seeding the register returned no row");
    }
    const recentAttempt = new Date(Date.now() - 60 * 1000);
    await db.insert(signInLookupAttempts).values(
      Array.from({ length: 9 }, () => ({
        registerId: register.id,
        attemptedAt: recentAttempt,
      })),
    );
    const now = new Date();

    const outcomes = await Promise.all(
      [randomUUID(), randomUUID()].map((name) =>
        lookUpSignIn(
          { store: new DrizzleSignInLookupStore(db), clock: { now: () => now } },
          { registerId: register.id, email: `${name}@example.com` },
        ),
      ),
    );

    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(["not_found", "rate_limited"]);
  });
});
