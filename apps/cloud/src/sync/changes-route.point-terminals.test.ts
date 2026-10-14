import { assignPointTerminal } from "@purosur/domain/payments/use-cases";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DrizzlePointTerminalAssignmentStore } from "../payments/drizzle-point-terminal-assignment-store.js";
import { locations } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { buildChangesRouteApp, pulledPage } from "./test-support/changes-route.js";
import { insertActor, insertRegister } from "./test-support/configured-point-of-sale.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const SEEDED_CHANGES = 4;

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  app = buildChangesRouteApp(db, { now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

async function pullAfterSeed(deviceToken: string) {
  const page = await pulledPage(app, SEEDED_CHANGES, deviceToken);
  return page.changes.map(({ change_seq, ...change }) => change);
}

async function assign(input: {
  locationId: string;
  registerId: string;
  terminalId: string | null;
  version: number;
  actorId: string;
}) {
  const outcome = await assignPointTerminal(
    new DrizzlePointTerminalAssignmentStore(db, () => NOW),
    input,
  );
  if (outcome.kind !== "assigned") {
    throw new Error(`test setup: assigning ended as ${outcome.kind}`);
  }
}

describe("GET /changes carrying the register's own Point terminal", () => {
  it("gives a register that its terminal is assigned, at its version, without naming the terminal", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(db, locationId, "Caja 1");
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    await assign({
      locationId,
      registerId,
      terminalId: "PAX_A910__SMARTPOS1",
      version: 0,
      actorId: await insertActor(db, locationId),
    });

    expect(await pullAfterSeed(deviceToken)).toEqual([
      {
        entity: "register_point_terminal",
        entity_id: registerId,
        row: { assigned: true, version: 1 },
      },
    ]);
  });

  it("gives a register its later clearing as unassigned at the new version", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(db, locationId, "Caja 1");
    const actorId = await insertActor(db, locationId);
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    const base = { locationId, registerId, actorId };
    await assign({ ...base, terminalId: "PAX_A910__SMARTPOS1", version: 0 });
    await assign({ ...base, terminalId: null, version: 1 });

    const pulled = await pullAfterSeed(deviceToken);

    expect(pulled).toEqual(
      Array(2).fill({
        entity: "register_point_terminal",
        entity_id: registerId,
        row: { assigned: false, version: 2 },
      }),
    );
  });

  it("gives a register nothing of another register's terminal, in its branch or in another", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(db, locationId, "Caja 1");
    const sameBranchRegisterId = await insertRegister(db, locationId, "Caja 2");
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other location returned no row");
    }
    const otherBranchRegisterId = await insertRegister(db, otherLocation.id, "Caja 3");
    const actorId = await insertActor(db, locationId);
    const { deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: registerId,
    });
    await assign({
      locationId,
      registerId: sameBranchRegisterId,
      terminalId: "PAX_A910__SMARTPOS1",
      version: 0,
      actorId,
    });
    await assign({
      locationId: otherLocation.id,
      registerId: otherBranchRegisterId,
      terminalId: "PAX_A910__SMARTPOS2",
      version: 0,
      actorId,
    });

    expect(await pullAfterSeed(deviceToken)).toEqual([]);
  });
});
