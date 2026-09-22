import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { admitSignInAttempt, SIGN_IN_FAILURE_LIMIT } from "./sign-in-lockout.js";

// PGlite serves every query on one connection, so only a real Postgres pool can race a burst of
// attempts from one source address against the ceiling that is supposed to cap them.
//
// One admission needs a connection to prune and another for its locked transaction, which it
// holds while it waits its turn on the advisory lock. A pool sized to the burst itself would
// leave later requests queueing for a connection with no timeout of their own, so the suite would
// hang rather than report anything: the headroom below, and each test's own timeout, keep an
// exhausted pool a loud failure instead of a silent wait.
const BURST = 20;

let integrationDb: IntegrationDatabase;
let sql: postgres.Sql;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("sign_in_lockout");
  sql = postgres(integrationDb.databaseUrl, { max: BURST * 4 });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

const NOON = new Date("2026-01-05T12:00:00.000Z");

describe("the sign-in lockout on concurrent connections", () => {
  it("admits exactly the limit out of a burst from one source address", async () => {
    const db = drizzle(sql);

    const admissions = await Promise.all(
      Array.from({ length: BURST }, () =>
        admitSignInAttempt(db, { sourceAddress: "198.51.100.10", now: NOON }),
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
        admitSignInAttempt(db, { sourceAddress: "198.51.100.20", now: NOON }),
      ),
    );

    const blocksSet = admissions.filter(
      (admission) => !admission.admitted && admission.trippedLockout !== null,
    );
    expect(blocksSet).toHaveLength(1);
  }, 30_000);
});
