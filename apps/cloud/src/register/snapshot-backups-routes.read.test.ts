import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registerSnapshotLifecycleRules } from "../platform/db/schema.js";
import { BACKOFFICE_ORIGIN } from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import {
  backupsSession,
  buildBackupsApp,
  insertGeneration,
  insertRegisterWithKeys,
} from "./test-support/snapshot-backups-routes.js";

const UNKNOWN_REGISTER_ID = "7d9b1f0e-3c52-4a8e-9d41-0b6f2e8a5c13";
const FIRST_GENERATION_ID = "0b5c7a31-8e24-4f6d-a1c9-3d7e2f9b4a60";
const SECOND_GENERATION_ID = "5e1a9c47-2b83-4d0f-8a6e-7c3b1d9f2e85";
const PRUNED_GENERATION_ID = "c4d8e2a6-1f59-4b37-9e0a-6a2d5c8b1f74";

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
  app = buildBackupsApp(db);
});

afterEach(async () => {
  await app.close();
});

function get(url: string, headers: Record<string, string> = {}) {
  return app.inject({ method: "GET", url, headers });
}

describe("GET /snapshot-backups/registers", () => {
  it("answers 401 unauthenticated without a session", async () => {
    const response = await get("/snapshot-backups/registers", { origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const session = await backupsSession(db);

    const response = await get("/snapshot-backups/registers", {
      ...session.headers,
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("answers 403 forbidden to a user without the backups permission", async () => {
    const session = await backupsSession(db, { permissionKeys: ["sell_and_charge"] });

    const response = await get("/snapshot-backups/registers", session.headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("lists every register by name", async () => {
    const second = await insertRegisterWithKeys(db, { name: "Caja 2", keyVersions: [] });
    const first = await insertRegisterWithKeys(db, { name: "Caja 1", keyVersions: [] });
    const session = await backupsSession(db);

    const response = await get("/snapshot-backups/registers", session.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      registers: [
        { id: first.registerId, name: "Caja 1" },
        { id: second.registerId, name: "Caja 2" },
      ],
    });
  });
});

describe("GET /snapshot-backups/registers/:registerId", () => {
  it("answers 403 forbidden to a user without the backups permission", async () => {
    const register = await insertRegisterWithKeys(db, { name: "Caja 1", keyVersions: [1] });
    const session = await backupsSession(db, { permissionKeys: ["sell_and_charge"] });

    const response = await get(
      `/snapshot-backups/registers/${register.registerId}`,
      session.headers,
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("answers 400 validation_failed for an id that is not a record id", async () => {
    const session = await backupsSession(db);

    const response = await get("/snapshot-backups/registers/not-an-id", session.headers);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("answers 404 register_not_found for a register that does not exist", async () => {
    const session = await backupsSession(db);

    const response = await get(
      `/snapshot-backups/registers/${UNKNOWN_REGISTER_ID}`,
      session.headers,
    );

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "register_not_found" });
  });

  it("answers the default rules and no generations for a register without backups", async () => {
    const register = await insertRegisterWithKeys(db, { name: "Caja 1", keyVersions: [1] });
    const session = await backupsSession(db);

    const response = await get(
      `/snapshot-backups/registers/${register.registerId}`,
      session.headers,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      rules: { hourly: 24, daily: 30, monthly: 12 },
      tiers: { recent: 0, hourly: 0, daily: 0, monthly: 0 },
      recent_limit: 6,
      generations: [],
    });
  });

  it("answers the stored rules, the generations newest first without the pruned ones, and the tier counts", async () => {
    await db.insert(registerSnapshotLifecycleRules).values({ hourly: 12, daily: 14, monthly: 6 });
    const register = await insertRegisterWithKeys(db, { name: "Caja 1", keyVersions: [1, 2] });
    await insertGeneration(db, register, {
      id: FIRST_GENERATION_ID,
      createdAt: new Date("2026-01-05T10:00:00.000Z"),
      keyVersion: 1,
      size: 4096,
    });
    await insertGeneration(db, register, {
      id: SECOND_GENERATION_ID,
      createdAt: new Date("2026-01-05T11:00:00.000Z"),
      status: "failed",
      failureReason: "hash_mismatch",
      keyVersion: 2,
    });
    await insertGeneration(db, register, {
      id: PRUNED_GENERATION_ID,
      createdAt: new Date("2026-01-01T11:00:00.000Z"),
      pruned: true,
    });
    const session = await backupsSession(db);

    const response = await get(
      `/snapshot-backups/registers/${register.registerId}`,
      session.headers,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      rules: { hourly: 12, daily: 14, monthly: 6 },
      tiers: { recent: 1, hourly: 1, daily: 1, monthly: 1 },
      recent_limit: 6,
      generations: [
        {
          id: SECOND_GENERATION_ID,
          created_at: "2026-01-05T11:00:00.000Z",
          size: 2048,
          status: "failed",
          failure_reason: "hash_mismatch",
          key_version: 2,
          counts_for_restore: false,
        },
        {
          id: FIRST_GENERATION_ID,
          created_at: "2026-01-05T10:00:00.000Z",
          size: 4096,
          status: "verified",
          failure_reason: null,
          key_version: 1,
          counts_for_restore: true,
        },
      ],
    });
  });
});
