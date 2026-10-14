import { randomUUID } from "node:crypto";
import { assignPointTerminal } from "@purosur/domain/payments/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerPointTerminals, registers, users } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePointTerminalAssignmentStore } from "./drizzle-point-terminal-assignment-store.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let adminSql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("register_point_terminal");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  adminSql = postgres(integrationDb.adminDatabaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await adminSql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("two registers assigned the same Point terminal at once on a real Postgres", () => {
  it("gives the terminal to one of them and refuses the other as terminal_taken", async () => {
    const locationId = await seededLocationId(db);
    const [actor] = await db
      .insert(users)
      .values({ firstName: "Ada Lucero", email: `ada-${randomUUID()}@example.com`, locationId })
      .returning({ id: users.id });
    const [first, second] = await db
      .insert(registers)
      .values([
        { locationId, name: `Caja ${randomUUID()}` },
        { locationId, name: `Caja ${randomUUID()}` },
      ])
      .returning({ id: registers.id });
    if (!actor || !first || !second) {
      throw new Error("test setup: seeding the registers returned no row");
    }
    const assign = (registerId: string) => () =>
      assignPointTerminal(new DrizzlePointTerminalAssignmentStore(db, () => NOON), {
        locationId,
        registerId,
        terminalId: "PAX_A910__SMARTPOS1",
        version: 0,
        actorId: actor.id,
      });

    // A SHARE lock lets both registers read that the terminal is free but parks both writes, so
    // the loser meets the winner's row in the terminal's unique index.
    const outcomes = await runQueuedBehindHeldLock(
      adminSql,
      (holder) => holder.unsafe("lock table register_point_terminals in share mode"),
      assign(first.id),
      assign(second.id),
    );

    expect(outcomes.map(({ kind }) => kind).sort()).toEqual(["assigned", "terminal_taken"]);
    expect(await db.select().from(registerPointTerminals)).toHaveLength(1);
  });
});
