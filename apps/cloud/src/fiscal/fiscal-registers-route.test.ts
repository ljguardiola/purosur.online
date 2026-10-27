import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerFiscalRegistersRoute } from "./fiscal-registers-route.js";
import { insertRegisterOf } from "./test-support/issued-document-fixtures.js";

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
  registerFiscalRegistersRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

function fiscalRegisters(headers: Record<string, string>) {
  return app.inject({ method: "GET", url: "/fiscal/registers", headers });
}

describe("GET /fiscal/registers", () => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await fiscalRegisters({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);

    const response = await fiscalRegisters({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may not view fiscal documents, even one who may view reports", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await fiscalRegisters(headers);

    expect(response.statusCode).toBe(403);
  });

  it("lists the registers of the session's branch by name to a user who may view fiscal documents", async () => {
    const { headers } = await signedInWith(db, ["view_fiscal_documents"], NOW);
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    const first = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
    await insertRegisterOf(db, await insertLocation(db), "Caja X");

    const response = await fiscalRegisters(headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      registers: [
        { id: first.registerId, name: "Caja 1" },
        { id: second.registerId, name: "Caja 2" },
      ],
    });
  });
});
