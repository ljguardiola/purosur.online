import {
  assignPointTerminal,
  PointTerminalAlreadyAssigned,
} from "@purosur/domain/payments/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import {
  auditLog,
  locations,
  registerPointTerminals,
  registers,
  users,
} from "../platform/db/schema.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePointTerminalAssignmentStore } from "./drizzle-point-terminal-assignment-store.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

async function insertActor(locationId: string): Promise<string> {
  const [actor] = await db
    .insert(users)
    .values({ firstName: "Ada Lucero", email: "ada@example.com", locationId })
    .returning({ id: users.id });
  if (!actor) {
    throw new Error("test setup: seeding the actor returned no row");
  }
  return actor.id;
}

async function insertRegister(locationId: string, name: string): Promise<string> {
  const [register] = await db
    .insert(registers)
    .values({ locationId, name })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  return register.id;
}

async function insertOtherLocation(): Promise<string> {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the other location returned no row");
  }
  return location.id;
}

function assign(input: {
  locationId: string;
  registerId: string;
  terminalId: string | null;
  version: number;
  actorId: string;
}) {
  return assignPointTerminal(new DrizzlePointTerminalAssignmentStore(db, () => NOON), input);
}

describe("assigning a register's Point terminal through DrizzlePointTerminalAssignmentStore", () => {
  it("stores the terminal for the register at version 1", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const registerId = await insertRegister(locationId, "Caja 1");

    const outcome = await assign({
      locationId,
      registerId,
      terminalId: "PAX_A910__SMARTPOS1",
      version: 0,
      actorId,
    });

    expect(outcome).toEqual({
      kind: "assigned",
      assignment: { terminalId: "PAX_A910__SMARTPOS1", version: 1 },
    });
    expect(await db.select().from(registerPointTerminals)).toEqual([
      { registerId, terminalId: "PAX_A910__SMARTPOS1", version: 1 },
    ]);
  });

  it("audits the actor with no previous value the first time and the replaced values after", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const registerId = await insertRegister(locationId, "Caja 1");
    const base = { locationId, registerId, actorId };
    await assign({ ...base, terminalId: "PAX_A910__SMARTPOS1", version: 0 });
    await assign({ ...base, terminalId: "PAX_A910__SMARTPOS2", version: 1 });
    await assign({ ...base, terminalId: null, version: 2 });

    expect(await db.select().from(auditLog)).toMatchObject([
      {
        entity: "register_point_terminal",
        entityId: registerId,
        actorId,
        previousValue: null,
        newValue: { terminal_id: "PAX_A910__SMARTPOS1", version: 1 },
      },
      {
        entity: "register_point_terminal",
        entityId: registerId,
        actorId,
        previousValue: { terminal_id: "PAX_A910__SMARTPOS1", version: 1 },
        newValue: { terminal_id: "PAX_A910__SMARTPOS2", version: 2 },
      },
      {
        entity: "register_point_terminal",
        entityId: registerId,
        actorId,
        previousValue: { terminal_id: "PAX_A910__SMARTPOS2", version: 2 },
        newValue: { terminal_id: null, version: 3 },
      },
    ]);
  });

  it("gives a terminal back to be assigned to another register, keeping the register's row", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const registerId = await insertRegister(locationId, "Caja 1");
    const otherRegisterId = await insertRegister(locationId, "Caja 2");
    const base = { locationId, actorId };
    await assign({ ...base, registerId, terminalId: "PAX_A910__SMARTPOS1", version: 0 });
    await assign({ ...base, registerId, terminalId: null, version: 1 });

    const outcome = await assign({
      ...base,
      registerId: otherRegisterId,
      terminalId: "PAX_A910__SMARTPOS1",
      version: 0,
    });

    expect(outcome).toMatchObject({ kind: "assigned" });
    expect(await db.select().from(registerPointTerminals)).toMatchObject([
      { registerId, terminalId: null, version: 2 },
      { registerId: otherRegisterId, terminalId: "PAX_A910__SMARTPOS1", version: 1 },
    ]);
  });

  it("refuses a terminal another register holds, changing nothing", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const registerId = await insertRegister(locationId, "Caja 1");
    const otherRegisterId = await insertRegister(locationId, "Caja 2");
    const base = { locationId, actorId, terminalId: "PAX_A910__SMARTPOS1", version: 0 };
    await assign({ ...base, registerId });
    const mark = await lastLoggedChangeSeq(db);

    const outcome = await assign({ ...base, registerId: otherRegisterId });

    expect(outcome).toEqual({ kind: "terminal_taken" });
    expect(await db.select().from(registerPointTerminals)).toMatchObject([{ registerId }]);
    expect(await changesLoggedAfter(db, mark)).toEqual([]);
  });

  it("finds no register of another branch and writes nothing", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const otherRegisterId = await insertRegister(await insertOtherLocation(), "Caja 1");

    const outcome = await assign({
      locationId,
      registerId: otherRegisterId,
      terminalId: "PAX_A910__SMARTPOS1",
      version: 0,
      actorId,
    });

    expect(outcome).toEqual({ kind: "register_not_found" });
    expect(await db.select().from(registerPointTerminals)).toEqual([]);
  });

  it("refuses a version other than the one stored, changing nothing", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const registerId = await insertRegister(locationId, "Caja 1");
    const base = { locationId, registerId, actorId };
    await assign({ ...base, terminalId: "PAX_A910__SMARTPOS1", version: 0 });

    const outcome = await assign({ ...base, terminalId: "PAX_A910__SMARTPOS2", version: 0 });

    expect(outcome).toEqual({ kind: "stale_version" });
    expect(await db.select().from(registerPointTerminals)).toMatchObject([
      { terminalId: "PAX_A910__SMARTPOS1", version: 1 },
    ]);
  });

  it("notes the register's own change at the new version, scoped to no branch", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const registerId = await insertRegister(locationId, "Caja 1");
    const base = { locationId, registerId, actorId };
    const mark = await lastLoggedChangeSeq(db);

    await assign({ ...base, terminalId: "PAX_A910__SMARTPOS1", version: 0 });
    await assign({ ...base, terminalId: null, version: 1 });

    expect(await changesLoggedAfter(db, mark)).toEqual([
      {
        entity: "register_point_terminal",
        entityId: registerId,
        version: 1,
        op: "insert",
        locationId: null,
      },
      {
        entity: "register_point_terminal",
        entityId: registerId,
        version: 2,
        op: "update",
        locationId: null,
      },
    ]);
  });

  it("logs nothing when the assignment is unchanged or refused", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const registerId = await insertRegister(locationId, "Caja 1");
    const base = { locationId, registerId, actorId };
    await assign({ ...base, terminalId: "PAX_A910__SMARTPOS1", version: 0 });
    const mark = await lastLoggedChangeSeq(db);

    await assign({ ...base, terminalId: "PAX_A910__SMARTPOS1", version: 1 });
    await assign({ ...base, terminalId: "PAX_A910__SMARTPOS2", version: 0 });

    expect(await changesLoggedAfter(db, mark)).toEqual([]);
  });

  it("raises an already-assigned error when a terminal is stored for two registers", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const registerId = await insertRegister(locationId, "Caja 1");
    const otherRegisterId = await insertRegister(locationId, "Caja 2");
    await db
      .insert(registerPointTerminals)
      .values({ registerId, terminalId: "PAX_A910__SMARTPOS1", version: 1 });
    const store = new DrizzlePointTerminalAssignmentStore(db, () => NOON);

    const recording = store.transaction((tx) =>
      tx.recordPointTerminalAssignment({
        registerId: otherRegisterId,
        terminalId: "PAX_A910__SMARTPOS1",
        version: 1,
        actorId,
      }),
    );

    await expect(recording).rejects.toBeInstanceOf(PointTerminalAlreadyAssigned);
  });
});

describe("DrizzlePointTerminalAssignmentStore's clock", () => {
  it("is required to build the store", () => {
    expectTypeOf<[PgDatabase<PgQueryResultHKT>]>().not.toExtend<
      ConstructorParameters<typeof DrizzlePointTerminalAssignmentStore>
    >();
  });
});
