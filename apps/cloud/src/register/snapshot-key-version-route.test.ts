import { cloudErrorSchema, currentSnapshotKeyVersionAnswerSchema } from "@purosur/contracts";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";
import { keyStore } from "./test-support/key-store.js";
import { buildSnapshotKeyVersionRouteApp } from "./test-support/snapshot-key-version-route.js";

const NOW = new Date("2026-10-15T15:00:00.000Z");
const PATH = "/devices/current/snapshot-key-version";

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
  app = buildSnapshotKeyVersionRouteApp(db, { now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

async function withSnapshotKeys(registerId: string, ...versions: number[]) {
  for (const version of versions) {
    await keyStore(db).transaction((tx) =>
      tx.recordSnapshotKey(registerId, { version, key: `key-${version}` }),
    );
  }
}

function get(authorization?: string) {
  return app.inject({
    method: "GET",
    url: PATH,
    ...(authorization !== undefined && { headers: { authorization } }),
  });
}

describe("GET /devices/current/snapshot-key-version", () => {
  it("answers an unauthenticated request with device_token_rejected", async () => {
    const response = await get();

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
  });

  it("answers an unknown device token with device_token_rejected", async () => {
    const response = await get("Bearer nope.nope");

    expect(response.statusCode).toBe(401);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
  });

  it("refuses a revoked installation", async () => {
    const { registerId, deviceToken } = await insertEnrolledInstallation(db, {
      now: NOW,
      revokedAt: NOW,
    });
    await withSnapshotKeys(registerId, 1);

    const response = await get(`Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(401);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
  });

  it("answers the latest snapshot key version of the device's register, not another register's", async () => {
    const mine = await insertEnrolledInstallation(db, { now: NOW });
    await withSnapshotKeys(mine.registerId, 1, 2);
    const other = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    await withSnapshotKeys(other.registerId, 1, 2, 3);

    const response = await get(`Bearer ${mine.deviceToken}`);

    expect(response.statusCode).toBe(200);
    expect(currentSnapshotKeyVersionAnswerSchema.parse(response.json())).toEqual({
      current_key_version: 2,
    });
  });

  it("answers not_found for a register that holds no snapshot key yet", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOW });

    const response = await get(`Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(404);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("not_found");
  });
});
