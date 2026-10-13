import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registers } from "../platform/db/schema.js";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerReportRegistersRoute } from "./report-registers-route.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");

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
  app = Fastify();
  registerReportRegistersRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

function reportRegisters(headers: Record<string, string>) {
  return app.inject({ method: "GET", url: "/reports/registers", headers });
}

describe("GET /reports/registers", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await reportRegisters({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await reportRegisters({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may not view reports", async () => {
    const { headers } = await signedInWith(db, ["view_stock_balances"], NOW);

    const response = await reportRegisters(headers);

    expect(response.statusCode).toBe(403);
  });

  it("lists the registers of the session's branch by name", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    const first = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
    await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: await anotherBranchRegister(),
    });

    const response = await reportRegisters(headers);

    expect(response.json()).toEqual({
      registers: [
        { id: first.registerId, name: "Caja 1" },
        { id: second.registerId, name: "Caja 2" },
      ],
    });
  });
});

async function anotherBranchRegister(): Promise<string> {
  const [register] = await db
    .insert(registers)
    .values({ locationId: await insertLocation(db), name: "Caja X" })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  return register.id;
}
