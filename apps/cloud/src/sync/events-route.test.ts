import {
  cloudErrorSchema,
  PUSH_EVENTS_REQUEST_MAX_BYTES,
  type PushEventsRequest,
  pushEventsResponseSchema,
} from "@purosur/contracts";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registerRouteAccess } from "../access/route-access.js";
import { deviceState, inbox } from "../platform/db/schema.js";
import { issueDeviceToken } from "../register/device-token.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { registerEventsRoute } from "./events-route.js";

const NOW = new Date("2026-10-01T09:30:00.000Z");

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
  registerRouteAccess(app);
  registerEventsRoute(app, {
    db,
    rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => NOW,
  });
});

afterEach(async () => {
  await app.close();
});

function event(deviceSeq: number): PushEventsRequest["events"][number] {
  return {
    event_id: crypto.randomUUID(),
    device_seq: deviceSeq,
    aggregate_type: "sale",
    aggregate_id: "sale-1",
    event_type: "sale_line_added",
    schema_version: 1,
    payload: { quantity: 2 },
    occurred_at: "2026-10-01T09:00:00.000Z",
    actor_id: "user-1",
    chain_hmac: "hmac",
  };
}

function body(...seqs: number[]): PushEventsRequest {
  return {
    app_version: "1.4.0",
    telemetry: { wal_size_bytes: 4096, disk_free_bytes: 50_000_000, disk_free_ratio: 0.42 },
    events: seqs.map(event),
  };
}

function push(payload: unknown, authorization?: string) {
  return app.inject({
    method: "POST",
    url: "/events",
    payload: payload as object,
    ...(authorization !== undefined && { headers: { authorization } }),
  });
}

describe("POST /events", () => {
  it("stores the pushed events and answers the ack", async () => {
    const { deviceId, deviceToken } = await insertEnrolledInstallation(db);

    const response = await push(body(1, 2, 3), `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(200);
    expect(pushEventsResponseSchema.parse(response.json())).toEqual({ status: "ok", ack_seq: 3 });
    const stored = await db.select().from(inbox).where(eq(inbox.deviceId, deviceId));
    expect(stored.map((row) => row.deviceSeq).sort()).toEqual([1, 2, 3]);
    expect(stored[0]).toMatchObject({
      aggregateType: "sale",
      payload: { quantity: 2 },
      occurredAt: new Date("2026-10-01T09:00:00.000Z"),
      receivedAt: NOW,
    });
  });

  it("accepts a full batch of large events although its body is over 1 MiB", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db);
    const seqs = Array.from({ length: 200 }, (_, index) => index + 1);
    const largeEvents = seqs.map((seq) => ({
      ...event(seq),
      payload: { lines: "x".repeat(7_000) },
    }));
    const largeBatch = { ...body(), events: largeEvents };
    expect(JSON.stringify(largeBatch).length).toBeGreaterThan(1_048_576);

    const response = await push(largeBatch, `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(200);
    expect(pushEventsResponseSchema.parse(response.json())).toEqual({
      status: "ok",
      ack_seq: 200,
    });
  });

  describe("the request size limit", () => {
    function bodyOfBytes(totalBytes: number): string {
      const empty = JSON.stringify({
        ...body(1),
        events: [{ ...event(1), payload: { filler: "" } }],
      });
      const filler = "x".repeat(totalBytes - Buffer.byteLength(empty));
      return JSON.stringify({ ...body(1), events: [{ ...event(1), payload: { filler } }] });
    }

    function pushRaw(rawBody: string, deviceToken: string) {
      return app.inject({
        method: "POST",
        url: "/events",
        payload: rawBody,
        headers: { authorization: `Bearer ${deviceToken}`, "content-type": "application/json" },
      });
    }

    it("accepts a request of exactly the contract's limit", async () => {
      const { deviceToken } = await insertEnrolledInstallation(db);
      const rawBody = bodyOfBytes(PUSH_EVENTS_REQUEST_MAX_BYTES);
      expect(Buffer.byteLength(rawBody)).toBe(PUSH_EVENTS_REQUEST_MAX_BYTES);

      const response = await pushRaw(rawBody, deviceToken);

      expect(response.statusCode).toBe(200);
    });

    it("refuses a request one byte over the contract's limit", async () => {
      const { deviceToken } = await insertEnrolledInstallation(db);

      const response = await pushRaw(bodyOfBytes(PUSH_EVENTS_REQUEST_MAX_BYTES + 1), deviceToken);

      expect(response.statusCode).toBe(400);
    });
  });

  it("records the installation's version and telemetry", async () => {
    const { deviceId, deviceToken } = await insertEnrolledInstallation(db);

    await push(body(1), `Bearer ${deviceToken}`);

    expect(await db.select().from(deviceState).where(eq(deviceState.deviceId, deviceId))).toEqual([
      {
        deviceId,
        lastPullSince: null,
        lastPulledAt: null,
        appVersion: "1.4.0",
        lastPushedAt: NOW,
        walSizeBytes: 4096,
        diskFreeBytes: 50_000_000,
        diskFreeRatio: 0.42,
      },
    ]);
  });

  it("answers the seq it expects and stores nothing of a batch that skips one", async () => {
    const { deviceId, deviceToken } = await insertEnrolledInstallation(db);

    const response = await push(body(2, 3), `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(200);
    expect(pushEventsResponseSchema.parse(response.json())).toEqual({
      status: "expected_seq",
      ack_seq: 0,
      expected_seq: 1,
    });
    expect(await db.select().from(inbox).where(eq(inbox.deviceId, deviceId))).toEqual([]);
  });

  it("answers stale_device for a seq the inbox holds under another event", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db);
    await push(body(1), `Bearer ${deviceToken}`);

    const response = await push(body(1), `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(200);
    expect(pushEventsResponseSchema.parse(response.json())).toEqual({
      status: "stale_device",
      ack_seq: 1,
    });
  });

  it("tells a revoked installation so, storing and recording nothing", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, {
      revokedAt: new Date("2026-10-01T08:00:00.000Z"),
    });

    const response = await push(body(1), `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(403);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({ code: "revoked" });
    expect(await db.select().from(inbox)).toEqual([]);
    expect(await db.select().from(deviceState)).toEqual([]);
  });

  it.each([
    ["no device token", undefined],
    ["a device token no installation holds", `Bearer ${issueDeviceToken().deviceToken}`],
    ["something that is not a device token", "Basic dXNlcjpwYXNz"],
  ])("refuses a request with %s, storing nothing", async (_case, authorization) => {
    await insertEnrolledInstallation(db);

    const response = await push(body(1), authorization);

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "device_token_rejected",
    });
    expect(await db.select().from(inbox)).toEqual([]);
  });

  it("refuses a body that is not a push, naming the field", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db);

    const response = await push({ ...body(1), events: [] }, `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(400);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "validation_failed",
      details: [{ field: "events" }],
    });
    expect(await db.select().from(deviceState)).toEqual([]);
  });

  it("answers a failure with the cloud error envelope, revealing nothing of it", {
    timeout: 30_000,
  }, async () => {
    const broken = await buildTestDatabase();
    await broken.close();
    const failing = Fastify();
    registerRouteAccess(failing);
    registerEventsRoute(failing, {
      db: broken.db,
      rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
      keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    });

    const response = await failing.inject({
      method: "POST",
      url: "/events",
      payload: body(1),
      headers: { authorization: `Bearer ${issueDeviceToken().deviceToken}` },
    });
    await failing.close();

    expect(response.statusCode).toBe(500);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({ code: "internal_error" });
    expect(response.body).not.toContain("register_installations");
  });
});
