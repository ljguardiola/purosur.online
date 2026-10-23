import {
  drizzle,
  type PostgresJsDatabase,
  type PostgresJsQueryResultHKT,
} from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  aRegisterRestoredTwice,
  insertBranch,
  insertInstallation,
  insertRegister,
  T0,
} from "../register/test-support/restored-register-installations.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleRegisterReplenishment } from "./drizzle-register-replenishment.js";
import { insertInboxEvent } from "./test-support/inbox-events.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let replenishment: DrizzleRegisterReplenishment<PostgresJsQueryResultHKT>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("register_replenishment_first_event");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
  replenishment = new DrizzleRegisterReplenishment(db);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("replenishing a register from its first installation's first event", () => {
  it("holds every event of the first installation and of the ones enrolled after it, and no other register's", async () => {
    const { registerId, predecessor, second } = await aRegisterRestoredTwice(db);
    const ofAnotherRegister = await insertInstallation(
      db,
      await insertRegister(db, await insertBranch(db)),
      { enrolledAt: T0 },
    );
    for (const deviceSeq of [1, 2]) {
      await insertInboxEvent(db, predecessor, { deviceSeq });
      await insertInboxEvent(db, second, { deviceSeq });
      await insertInboxEvent(db, ofAnotherRegister, { deviceSeq });
    }

    const events = await replenishment.ownEventsAbove(
      registerId,
      { predecessorDeviceId: predecessor, lastAcknowledgedSeq: 0 },
      undefined,
      100,
      new Map(),
    );

    expect(events.map(({ deviceId, event }) => [deviceId, event.device_seq])).toEqual([
      [predecessor, 1],
      [predecessor, 2],
      [second, 1],
      [second, 2],
    ]);
  });
});
