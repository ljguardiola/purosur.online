import {
  cloudErrorSchema,
  restorableSnapshotsSchema,
  snapshotUploadAnswerSchema,
} from "@purosur/contracts";
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  registerSnapshotGenerations,
  registerSnapshotRetentionFreezes,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import type { RegisterSnapshotUrls } from "./register-snapshot-routes.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";
import { keyStore } from "./test-support/key-store.js";
import { buildRegisterSnapshotRoutesApp } from "./test-support/register-snapshot-routes.js";

const NOW = new Date("2026-10-14T15:00:00.000Z");
const GENERATION_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const OTHER_GENERATION_ID = "6c1d3e84-0a52-4b0e-8a9f-1d2e3f4a5b6c";
const SHA = "ab".repeat(32);
const BODY = { generation_id: GENERATION_ID, size: 4096, sha256: SHA, key_version: 1 };

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let reported: unknown[];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  reported = [];
});

afterEach(async () => {
  await app.close();
});

const urls: RegisterSnapshotUrls = {
  uploadAuthorization: async (generation) => ({
    url: `https://bucket.example.test/snapshots/${generation.registerId}/${generation.generationId}?sig=up`,
    requiredHeaders: { "x-amz-meta-key-version": String(generation.keyVersion) },
    expiresAt: new Date("2026-10-14T15:15:00.000Z"),
  }),
  downloadUrl: async (registerId, generationId) =>
    `https://bucket.example.test/snapshots/${registerId}/${generationId}?sig=down`,
};

function build(options: { urls?: RegisterSnapshotUrls } = { urls }) {
  app = buildRegisterSnapshotRoutesApp(db, {
    now: () => NOW,
    reportError: (error) => reported.push(error),
    ...(options.urls && { urls: options.urls }),
  });
}

async function enrolled(overrides: { revokedAt?: Date } = {}) {
  const installation = await insertEnrolledInstallation(db, { now: NOW, ...overrides });
  await keyStore(db).transaction((tx) =>
    tx.recordSnapshotKey(installation.registerId, { version: 1, key: "key-1" }),
  );
  return installation;
}

function call(
  method: "GET" | "POST",
  url: string,
  options: { authorization?: string; payload?: unknown } = {},
) {
  return app.inject({
    method,
    url,
    ...(options.authorization !== undefined && {
      headers: { authorization: options.authorization },
    }),
    ...(options.payload !== undefined && { payload: options.payload as object }),
  });
}

async function seedGeneration(
  installation: { registerId: string; deviceId: string },
  overrides: Partial<typeof registerSnapshotGenerations.$inferInsert> = {},
) {
  await db.insert(registerSnapshotGenerations).values({
    id: GENERATION_ID,
    registerId: installation.registerId,
    deviceId: installation.deviceId,
    createdAt: NOW,
    size: 4096,
    sha256: SHA,
    keyVersion: 1,
    ...overrides,
  });
}

const ROUTES = [
  ["POST", "/devices/current/snapshots", BODY],
  ["POST", `/devices/current/snapshots/${GENERATION_ID}/uploaded`, undefined],
  ["POST", "/devices/current/snapshot-corruption", { stage: "copy" }],
  ["GET", "/devices/current/snapshots", undefined],
] as const;

describe.each(ROUTES)("%s %s", (method, url, payload) => {
  it("answers an unauthenticated request with device_token_rejected", async () => {
    build();

    const response = await call(method, url, { payload });

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
  });

  it("answers an unknown device token with device_token_rejected", async () => {
    build();

    const response = await call(method, url, { authorization: "Bearer nope.nope", payload });

    expect(response.statusCode).toBe(401);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
  });

  it("refuses a revoked installation", async () => {
    const { deviceToken } = await enrolled({ revokedAt: NOW });
    build();

    const response = await call(method, url, { authorization: `Bearer ${deviceToken}`, payload });

    expect(response.statusCode).toBe(401);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("device_token_rejected");
  });

  it("answers snapshot_backups_unavailable when no snapshots bucket is configured", async () => {
    const { deviceToken } = await enrolled();
    build({});

    const response = await call(method, url, { authorization: `Bearer ${deviceToken}`, payload });

    expect(response.statusCode).toBe(503);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("snapshot_backups_unavailable");
    expect(await db.select().from(registerSnapshotGenerations)).toEqual([]);
  });
});

describe("POST /devices/current/snapshots", () => {
  it("authorizes the upload, recording the generation as declared at the cloud's time", async () => {
    const installation = await enrolled();
    build();

    const response = await call("POST", "/devices/current/snapshots", {
      authorization: `Bearer ${installation.deviceToken}`,
      payload: BODY,
    });

    expect(response.statusCode).toBe(200);
    expect(snapshotUploadAnswerSchema.parse(response.json())).toEqual({
      upload_url: `https://bucket.example.test/snapshots/${installation.registerId}/${GENERATION_ID}?sig=up`,
      required_headers: { "x-amz-meta-key-version": "1" },
      expires_at: "2026-10-14T15:15:00.000Z",
    });
    expect(await db.select().from(registerSnapshotGenerations)).toMatchObject([
      {
        id: GENERATION_ID,
        registerId: installation.registerId,
        deviceId: installation.deviceId,
        createdAt: NOW,
        size: 4096,
        sha256: SHA,
        keyVersion: 1,
        status: "declared",
      },
    ]);
  });

  it("authorizes the same declaration again with the same answer", async () => {
    const { deviceToken } = await enrolled();
    build();
    const authorization = `Bearer ${deviceToken}`;
    const first = await call("POST", "/devices/current/snapshots", {
      authorization,
      payload: BODY,
    });

    const second = await call("POST", "/devices/current/snapshots", {
      authorization,
      payload: BODY,
    });

    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(await db.select().from(registerSnapshotGenerations)).toHaveLength(1);
  });

  it("answers conflict for a generation id declared again differently", async () => {
    const { deviceToken } = await enrolled();
    build();
    const authorization = `Bearer ${deviceToken}`;
    await call("POST", "/devices/current/snapshots", { authorization, payload: BODY });

    const response = await call("POST", "/devices/current/snapshots", {
      authorization,
      payload: { ...BODY, size: 1 },
    });

    expect(response.statusCode).toBe(409);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("conflict");
  });

  it("answers conflict for a generation that is already verified", async () => {
    const installation = await enrolled();
    await seedGeneration(installation, { status: "verified" });
    build();

    const response = await call("POST", "/devices/current/snapshots", {
      authorization: `Bearer ${installation.deviceToken}`,
      payload: BODY,
    });

    expect(response.statusCode).toBe(409);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("conflict");
  });

  it("answers validation_failed for a key version the register does not hold", async () => {
    const { deviceToken } = await enrolled();
    build();

    const response = await call("POST", "/devices/current/snapshots", {
      authorization: `Bearer ${deviceToken}`,
      payload: { ...BODY, key_version: 9 },
    });

    expect(response.statusCode).toBe(400);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "validation_failed",
      details: [{ field: "key_version" }],
    });
    expect(await db.select().from(registerSnapshotGenerations)).toEqual([]);
  });

  it("refuses a body that does not match the declaration's shape", async () => {
    const { deviceToken } = await enrolled();
    build();

    const response = await call("POST", "/devices/current/snapshots", {
      authorization: `Bearer ${deviceToken}`,
      payload: { ...BODY, sha256: "ABC" },
    });

    expect(response.statusCode).toBe(400);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "validation_failed",
      details: [{ field: "sha256" }],
    });
  });

  it("answers snapshot_backups_unavailable, reporting why, when the bucket cannot presign", async () => {
    const { deviceToken } = await enrolled();
    build({
      urls: {
        ...urls,
        uploadAuthorization: async () => {
          throw new Error("signing failed");
        },
      },
    });

    const response = await call("POST", "/devices/current/snapshots", {
      authorization: `Bearer ${deviceToken}`,
      payload: BODY,
    });

    expect(response.statusCode).toBe(503);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("snapshot_backups_unavailable");
    expect(reported).toHaveLength(1);
  });
});

describe("POST /devices/current/snapshots/:generationId/uploaded", () => {
  it("marks the register's generation as uploaded", async () => {
    const installation = await enrolled();
    await seedGeneration(installation);
    build();

    const response = await call("POST", `/devices/current/snapshots/${GENERATION_ID}/uploaded`, {
      authorization: `Bearer ${installation.deviceToken}`,
    });

    expect(response.statusCode).toBe(204);
    expect(await db.select().from(registerSnapshotGenerations)).toMatchObject([
      { status: "uploaded", uploadReportedAt: NOW },
    ]);
  });

  it("answers not_found for a generation nobody declared", async () => {
    const { deviceToken } = await enrolled();
    build();

    const response = await call("POST", `/devices/current/snapshots/${GENERATION_ID}/uploaded`, {
      authorization: `Bearer ${deviceToken}`,
    });

    expect(response.statusCode).toBe(404);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("not_found");
  });

  it("answers not_found for another register's generation, changing nothing", async () => {
    const other = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    await keyStore(db).transaction((tx) =>
      tx.recordSnapshotKey(other.registerId, { version: 1, key: "other-key" }),
    );
    await seedGeneration(other);
    const { deviceToken } = await enrolled();
    build();

    const response = await call("POST", `/devices/current/snapshots/${GENERATION_ID}/uploaded`, {
      authorization: `Bearer ${deviceToken}`,
    });

    expect(response.statusCode).toBe(404);
    expect(await db.select().from(registerSnapshotGenerations)).toMatchObject([
      { status: "declared" },
    ]);
  });

  it("refuses a generation id that is not a uuid", async () => {
    const { deviceToken } = await enrolled();
    build();

    const response = await call("POST", "/devices/current/snapshots/not-a-uuid/uploaded", {
      authorization: `Bearer ${deviceToken}`,
    });

    expect(response.statusCode).toBe(400);
    expect(cloudErrorSchema.parse(response.json()).code).toBe("validation_failed");
  });
});

describe("POST /devices/current/snapshot-corruption", () => {
  it("freezes the register's retention at the stage it reports", async () => {
    const installation = await enrolled();
    build();

    const response = await call("POST", "/devices/current/snapshot-corruption", {
      authorization: `Bearer ${installation.deviceToken}`,
      payload: { stage: "integrity_check" },
    });

    expect(response.statusCode).toBe(204);
    expect(await db.select().from(registerSnapshotRetentionFreezes)).toEqual([
      { registerId: installation.registerId, stage: "integrity_check", frozenAt: NOW },
    ]);
  });

  it("refuses a stage it does not know", async () => {
    const { deviceToken } = await enrolled();
    build();

    const response = await call("POST", "/devices/current/snapshot-corruption", {
      authorization: `Bearer ${deviceToken}`,
      payload: { stage: "upload" },
    });

    expect(response.statusCode).toBe(400);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "validation_failed",
      details: [{ field: "stage" }],
    });
    expect(await db.select().from(registerSnapshotRetentionFreezes)).toEqual([]);
  });
});

describe("GET /devices/current/snapshots", () => {
  it("lists the register's verified generations, newest first, with a download URL each", async () => {
    const installation = await enrolled();
    await seedGeneration(installation, {
      status: "verified",
      createdAt: new Date("2026-10-14T10:00:00.000Z"),
    });
    await seedGeneration(installation, {
      id: OTHER_GENERATION_ID,
      status: "verified",
      createdAt: new Date("2026-10-14T11:00:00.000Z"),
      size: 8192,
    });
    await seedGeneration(installation, {
      id: "11111111-1111-4111-8111-111111111111",
      status: "uploaded",
    });
    await seedGeneration(installation, {
      id: "22222222-2222-4222-8222-222222222222",
      status: "failed",
      failureReason: "never_uploaded",
    });
    build();

    const response = await call("GET", "/devices/current/snapshots", {
      authorization: `Bearer ${installation.deviceToken}`,
    });

    expect(response.statusCode).toBe(200);
    expect(restorableSnapshotsSchema.parse(response.json())).toEqual({
      generations: [
        {
          generation_id: OTHER_GENERATION_ID,
          created_at: "2026-10-14T11:00:00.000Z",
          size: 8192,
          sha256: SHA,
          key_version: 1,
          download_url: `https://bucket.example.test/snapshots/${installation.registerId}/${OTHER_GENERATION_ID}?sig=down`,
        },
        {
          generation_id: GENERATION_ID,
          created_at: "2026-10-14T10:00:00.000Z",
          size: 4096,
          sha256: SHA,
          key_version: 1,
          download_url: `https://bucket.example.test/snapshots/${installation.registerId}/${GENERATION_ID}?sig=down`,
        },
      ],
    });
  });

  it("lists no other register's generation", async () => {
    const other = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    await keyStore(db).transaction((tx) =>
      tx.recordSnapshotKey(other.registerId, { version: 1, key: "other-key" }),
    );
    await seedGeneration(other, { status: "verified" });
    const { deviceToken } = await enrolled();
    build();

    const response = await call("GET", "/devices/current/snapshots", {
      authorization: `Bearer ${deviceToken}`,
    });

    expect(restorableSnapshotsSchema.parse(response.json())).toEqual({ generations: [] });
  });

  it("answers snapshot_backups_unavailable, reporting why, when the bucket cannot presign", async () => {
    const installation = await enrolled();
    await seedGeneration(installation, { status: "verified" });
    build({
      urls: {
        ...urls,
        downloadUrl: async () => {
          throw new Error("signing failed");
        },
      },
    });

    const response = await call("GET", "/devices/current/snapshots", {
      authorization: `Bearer ${installation.deviceToken}`,
    });

    expect(response.statusCode).toBe(503);
    expect(reported).toHaveLength(1);
  });
});
