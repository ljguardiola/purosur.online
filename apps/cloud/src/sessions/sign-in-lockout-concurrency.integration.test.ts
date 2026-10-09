import {
  SIGN_IN_FAILURE_LIMIT,
  signInBlockedUntil,
  signInLockoutWindowStart,
} from "@purosur/domain";
import { admitSignInAttempt } from "@purosur/domain/sessions/use-cases";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signInFailures } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleSignInLockoutStore } from "./sign-in-lockout.js";

// PGlite serves every query on one connection, so only a real Postgres pool can race a burst.
const BURST = 20;

let integrationDb: IntegrationDatabase;
let sql: postgres.Sql;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("sign_in_lockout");
  sql = postgres(integrationDb.databaseUrl, { max: BURST });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

const NOON = new Date("2026-01-05T12:00:00.000Z");
const WINDOW_START = signInLockoutWindowStart(NOON);
const EXPIRED = new Date(WINDOW_START.getTime() - 60_000);

describe("the sign-in lockout on concurrent connections", () => {
  it("admits exactly the limit out of a burst from one source address", async () => {
    const db = drizzle(sql);

    const admissions = await Promise.all(
      Array.from({ length: BURST }, () =>
        admitSignInAttempt(
          { store: new DrizzleSignInLockoutStore(db) },
          { sourceAddress: "198.51.100.10", at: NOON },
        ),
      ),
    );

    expect(admissions.filter((admission) => admission.admitted)).toHaveLength(
      SIGN_IN_FAILURE_LIMIT,
    );
  }, 30_000);

  it("sets the block once for that whole burst, so it is audited as the one block it is", async () => {
    const db = drizzle(sql);

    const admissions = await Promise.all(
      Array.from({ length: BURST }, () =>
        admitSignInAttempt(
          { store: new DrizzleSignInLockoutStore(db) },
          { sourceAddress: "198.51.100.20", at: NOON },
        ),
      ),
    );

    const blocksSet = admissions.filter(
      (admission) => !admission.admitted && admission.trippedLockout !== null,
    );
    expect(blocksSet).toHaveLength(1);
  }, 30_000);

  it("blocks two addresses at once while each one's prune holds the other's expired failures", async () => {
    const db = drizzle(sql);
    const store = new DrizzleSignInLockoutStore(db);
    const first = "198.51.100.30";
    const second = "198.51.100.31";
    await db.insert(signInFailures).values([
      { sourceAddress: first, attemptedAt: EXPIRED },
      { sourceAddress: second, attemptedAt: EXPIRED },
    ]);
    const firstFailureHeld = Promise.withResolvers<void>();
    const releaseFirstFailure = Promise.withResolvers<void>();
    const firstPruned = Promise.withResolvers<void>();
    const secondPruned = Promise.withResolvers<void>();

    const holder = sql.begin(async (tx) => {
      await tx`select id from sign_in_failures where source_address = ${first} for update`;
      firstFailureHeld.resolve();
      await releaseFirstFailure.promise;
    });
    await firstFailureHeld.promise;
    const firstBlock = store.transaction(async (tx) => {
      await tx.lockSourceAddress(first);
      await tx.pruneFailuresOutsideWindow(WINDOW_START);
      firstPruned.resolve();
      await secondPruned.promise;
      return tx.blockSourceAddress({
        sourceAddress: first,
        blockedUntil: signInBlockedUntil(NOON),
        failuresSince: WINDOW_START,
      });
    });
    await firstPruned.promise;
    releaseFirstFailure.resolve();
    await holder;
    const secondBlock = store.transaction(async (tx) => {
      await tx.lockSourceAddress(second);
      await tx.pruneFailuresOutsideWindow(WINDOW_START);
      secondPruned.resolve();
      return tx.blockSourceAddress({
        sourceAddress: second,
        blockedUntil: signInBlockedUntil(NOON),
        failuresSince: WINDOW_START,
      });
    });

    await expect(Promise.all([firstBlock, secondBlock])).resolves.toHaveLength(2);
  }, 30_000);
});
