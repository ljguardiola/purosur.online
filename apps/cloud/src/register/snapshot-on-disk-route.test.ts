import { cloudErrorSchema } from "@purosur/contracts";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registerSnapshotGenerations } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";
import { keyStore } from "./test-support/key-store.js";
import { buildSnapshotOnDiskRouteApp } from "./test-support/snapshot-on-disk-route.js";

const NOW = new Date("2026-10-15T15:00:00.000Z");
const PATH = "/devices/current/snapshots/on-disk";
const FIRST_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const SECOND_ID = "6c1d3e84-0a52-4b0e-8a9f-1d2e3f4a5b6c";
const THIRD_ID = "9a7e5c31-4d28-4b60-8f13-2e6a0c9d7b45";
const UNKNOWN_ID = "d2b4f6a8-1c3e-4a50-9b72-8e0f1a3c5d79";
const SHA = "ab".repeat(32);

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
  app = buildSnapshotOnDiskRouteApp(db, { now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

async function enrolled(overrides: { revokedAt?: Date; registerName?: string } = {}) {
  const installation = await insertEnrolledInstallation(db, { now: NOW, ...overrides });
  await keyStore(db).transaction((tx) =>
    tx.recordSnapshotKey(installation.registerId, { version: 1, key: "key-1" }),
  );
  return installation;
}

async function seedGeneration(
  installation: { registerId: string; deviceId: string },
  id: string,
  onRegisterDisk: boolean,
) {
  await db.insert(registerSnapshotGenerations).values({
    id,
    registerId: installation.registerId,
    deviceId: installation.deviceId,
    createdAt: NOW,
    size: 4096,
    sha256: SHA,
    keyVersion: 1,
    onRegisterDisk,
  });
}

async function onDisk(id: string) {
  const [row] = await db
    .select({ onRegisterDisk: registerSnapshotGenerations.onRegisterDisk })
    .from(registerSnapshotGenerations)
    .where(eq(registerSnapshotGenerations.id, id));
  return row?.onRegisterDisk;
}

function put(payload: unknown, authorization?: string) {
  return app.inject({
    method: "PUT",
    url: PATH,
    ...(authorization !== undefined && { headers: { authorization } }),
    payload: payload as object,
  });
}

describe("PUT /devices/current/snapshots/on-disk", () => {
  it("answers an unauthenticated request with device_token_rejected", async () => {
    const response = await put({ generation_ids: [] });

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
  });

  it("answers an unknown device token with device_token_rejected", async () => {
    const response = await put({ generation_ids: [] }, "Bearer nope.nope");

    expect(response.statusCode).toBe(401);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
  });

  it("refuses a revoked installation", async () => {
    const { deviceToken } = await enrolled({ revokedAt: NOW });

    const response = await put({ generation_ids: [] }, `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(401);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
  });

  it.each([
    ["no ids", {}],
    ["an id that is not a uuid", { generation_ids: ["g1"] }],
  ])("answers validation_failed for a body with %s", async (_name, body) => {
    const { deviceToken } = await enrolled();

    const response = await put(body, `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(400);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("validation_failed");
  });

  it("marks the reported generations as on the register's disk and the register's others as not", async () => {
    const installation = await enrolled();
    await seedGeneration(installation, FIRST_ID, false);
    await seedGeneration(installation, SECOND_ID, true);
    await seedGeneration(installation, THIRD_ID, true);

    const response = await put(
      { generation_ids: [FIRST_ID, THIRD_ID, UNKNOWN_ID] },
      `Bearer ${installation.deviceToken}`,
    );

    expect(response.statusCode).toBe(204);
    expect(await onDisk(FIRST_ID)).toBe(true);
    expect(await onDisk(SECOND_ID)).toBe(false);
    expect(await onDisk(THIRD_ID)).toBe(true);
    expect(await db.select().from(registerSnapshotGenerations)).toHaveLength(3);
  });

  it("marks every generation of the register as off its disk when none is reported", async () => {
    const installation = await enrolled();
    await seedGeneration(installation, FIRST_ID, true);

    const response = await put({ generation_ids: [] }, `Bearer ${installation.deviceToken}`);

    expect(response.statusCode).toBe(204);
    expect(await onDisk(FIRST_ID)).toBe(false);
  });

  it("leaves another register's generations as they are, even when their ids are reported", async () => {
    const mine = await enrolled();
    const other = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    await keyStore(db).transaction((tx) =>
      tx.recordSnapshotKey(other.registerId, { version: 1, key: "key-1" }),
    );
    await seedGeneration(other, SECOND_ID, true);
    await seedGeneration(other, THIRD_ID, false);

    await put({ generation_ids: [THIRD_ID] }, `Bearer ${mine.deviceToken}`);

    expect(await onDisk(SECOND_ID)).toBe(true);
    expect(await onDisk(THIRD_ID)).toBe(false);
  });
});
