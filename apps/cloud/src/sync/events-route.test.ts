import {
  cloudErrorSchema,
  PUSH_EVENTS_REQUEST_MAX_BYTES,
  type PushEventsRequest,
  pushEventsResponseSchema,
} from "@purosur/contracts";
import { canonicalOutboxEvent } from "@purosur/domain";
import { eq } from "drizzle-orm";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerRouteAccess } from "../access/route-access.js";
import {
  deviceState,
  inbox,
  installationRequestAttempts,
  refusedEvents,
  registerInstallations,
} from "../platform/db/schema.js";
import { issueDeviceToken } from "../register/device-token.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase } from "../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { registerEventsRoute } from "./events-route.js";
import { hmacEventChain } from "./hmac-event-chain.js";
import {
  insertAdmittedRequests,
  insertRequestsUpToLimit,
} from "./test-support/admitted-requests.js";
import { eventsRouteUnderTest, NOW } from "./test-support/events-route.js";

const route = eventsRouteUnderTest();

const CHAIN_KEY = Buffer.alloc(32, 3).toString("base64");

type PushedWireEvent = PushEventsRequest["events"][number];

function linked(previousLink: string | null, events: PushedWireEvent[]): PushedWireEvent[] {
  let link = previousLink;
  return events.map(({ chain_hmac: _unlinked, ...unlinked }) => {
    link = hmacEventChain.link(CHAIN_KEY, link, canonicalOutboxEvent(unlinked));
    return { ...unlinked, chain_hmac: link };
  });
}

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
    events: linked(null, seqs.map(event)),
  };
}

function bodyOf(events: PushedWireEvent[]): PushEventsRequest {
  return { ...body(), events };
}

function enroll(options: Omit<Parameters<typeof insertEnrolledInstallation>[1], "now"> = {}) {
  return insertEnrolledInstallation(route.db, { now: NOW, outboxChainKey: CHAIN_KEY, ...options });
}

function push(payload: unknown, authorization?: string) {
  return route.app.inject({
    method: "POST",
    url: "/events",
    payload: payload as object,
    ...(authorization !== undefined && { headers: { authorization } }),
  });
}

describe("POST /events", () => {
  it("stores the pushed events and answers the ack", async () => {
    const { deviceId, deviceToken } = await enroll();

    const response = await push(body(1, 2, 3), `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(200);
    expect(pushEventsResponseSchema.parse(response.json())).toEqual({ status: "ok", ack_seq: 3 });
    const stored = await route.db.select().from(inbox).where(eq(inbox.deviceId, deviceId));
    expect(stored.map((row) => row.deviceSeq).sort()).toEqual([1, 2, 3]);
    expect(stored[0]).toMatchObject({
      aggregateType: "sale",
      payload: { quantity: 2 },
      occurredAt: new Date("2026-10-01T09:00:00.000Z"),
      receivedAt: NOW,
    });
  });

  it("accepts a full batch of large events although its body is over 1 MiB", async () => {
    const { deviceToken } = await enroll();
    const seqs = Array.from({ length: 200 }, (_, index) => index + 1);
    const largeEvents = seqs.map((seq) => ({
      ...event(seq),
      payload: { lines: "x".repeat(7_000) },
    }));
    const largeBatch = bodyOf(linked(null, largeEvents));
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
      const withFiller = (filler: string) =>
        JSON.stringify(bodyOf(linked(null, [{ ...event(1), payload: { filler } }])));
      const filler = "x".repeat(totalBytes - Buffer.byteLength(withFiller("")));
      return withFiller(filler);
    }

    function pushRaw(rawBody: string, deviceToken: string) {
      return route.app.inject({
        method: "POST",
        url: "/events",
        payload: rawBody,
        headers: { authorization: `Bearer ${deviceToken}`, "content-type": "application/json" },
      });
    }

    it("accepts a request of exactly the contract's limit", async () => {
      const { deviceToken } = await enroll();
      const rawBody = bodyOfBytes(PUSH_EVENTS_REQUEST_MAX_BYTES);
      expect(Buffer.byteLength(rawBody)).toBe(PUSH_EVENTS_REQUEST_MAX_BYTES);

      const response = await pushRaw(rawBody, deviceToken);

      expect(response.statusCode).toBe(200);
    });

    it("refuses a request one byte over the contract's limit", async () => {
      const { deviceToken } = await enroll();

      const response = await pushRaw(bodyOfBytes(PUSH_EVENTS_REQUEST_MAX_BYTES + 1), deviceToken);

      expect(response.statusCode).toBe(400);
    });
  });

  it("records the installation's version and telemetry", async () => {
    const { deviceId, deviceToken } = await enroll();

    await push(body(1), `Bearer ${deviceToken}`);

    expect(
      await route.db.select().from(deviceState).where(eq(deviceState.deviceId, deviceId)),
    ).toEqual([
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
    const { deviceId, deviceToken } = await enroll();

    const response = await push(body(2, 3), `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(200);
    expect(pushEventsResponseSchema.parse(response.json())).toEqual({
      status: "expected_seq",
      ack_seq: 0,
      expected_seq: 1,
    });
    expect(await route.db.select().from(inbox).where(eq(inbox.deviceId, deviceId))).toEqual([]);
  });

  it("answers stale_device for a seq the inbox holds under another event", async () => {
    const { deviceToken } = await enroll();
    await push(body(1), `Bearer ${deviceToken}`);

    const response = await push(body(1), `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(200);
    expect(pushEventsResponseSchema.parse(response.json())).toEqual({
      status: "stale_device",
      ack_seq: 1,
    });
  });

  it("answers update_required to a version that is not accepted, storing no event but recording the report", async () => {
    const { deviceId, deviceToken } = await enroll();

    const response = await push({ ...body(1), app_version: "1.4" }, `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(200);
    expect(pushEventsResponseSchema.parse(response.json())).toEqual({
      status: "update_required",
      ack_seq: 0,
    });
    expect(await route.db.select().from(inbox).where(eq(inbox.deviceId, deviceId))).toEqual([]);
    const [state] = await route.db
      .select()
      .from(deviceState)
      .where(eq(deviceState.deviceId, deviceId));
    expect(state?.appVersion).toBe("1.4");
  });

  it("records each admitted push as a request of its installation", async () => {
    const { deviceId, deviceToken } = await enroll();

    await push(body(1), `Bearer ${deviceToken}`);

    expect(
      await route.db
        .select({ endpoint: installationRequestAttempts.endpoint })
        .from(installationRequestAttempts)
        .where(eq(installationRequestAttempts.deviceId, deviceId)),
    ).toEqual([{ endpoint: "push" }]);
  });

  it("refuses a push past the installation's limit with when to retry, storing and recording nothing", async () => {
    const { deviceId, deviceToken } = await enroll();
    await insertRequestsUpToLimit(
      route.db,
      deviceId,
      "push",
      new Date(NOW.getTime() - 59 * 60 * 1000),
    );

    const response = await push(body(1), `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("60");
    expect(cloudErrorSchema.parse(response.json())).toEqual({
      code: "rate_limited",
      message: "too many requests",
      details: [{ retry_after_seconds: 60 }],
    });
    expect(await route.db.select().from(inbox).where(eq(inbox.deviceId, deviceId))).toEqual([]);
    expect(await route.db.select().from(deviceState)).toEqual([]);
  });

  it("does not count the pushes of another endpoint", async () => {
    const { deviceId, deviceToken } = await enroll();
    await insertAdmittedRequests(route.db, deviceId, "pull", NOW, 5000);

    const response = await push(body(1), `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(200);
  });

  it("tells a revoked installation so before counting its request", async () => {
    const { deviceId, deviceToken } = await enroll({
      revokedAt: new Date("2026-10-01T08:00:00.000Z"),
    });
    await insertRequestsUpToLimit(route.db, deviceId, "push", NOW);

    const response = await push(body(1), `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(403);
  });

  it("tells a revoked installation so, storing and recording nothing", async () => {
    const { deviceToken } = await enroll({
      revokedAt: new Date("2026-10-01T08:00:00.000Z"),
    });

    const response = await push(body(1), `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(403);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({ code: "revoked" });
    expect(await route.db.select().from(inbox)).toEqual([]);
    expect(await route.db.select().from(deviceState)).toEqual([]);
  });

  it.each([
    ["no device token", undefined],
    ["a device token no installation holds", `Bearer ${issueDeviceToken().deviceToken}`],
    ["something that is not a device token", "Basic dXNlcjpwYXNz"],
  ])("refuses a request with %s, storing nothing", async (_case, authorization) => {
    await enroll();

    const response = await push(body(1), authorization);

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "device_token_rejected",
    });
    expect(await route.db.select().from(inbox)).toEqual([]);
  });

  it("refuses a body that is not a push, naming the field", async () => {
    const { deviceToken } = await enroll();

    const response = await push({ ...body(1), events: [] }, `Bearer ${deviceToken}`);

    expect(response.statusCode).toBe(400);
    expect(cloudErrorSchema.parse(response.json())).toMatchObject({
      code: "validation_failed",
      details: [{ field: "events" }],
    });
    expect(await route.db.select().from(deviceState)).toEqual([]);
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
      now: () => NOW,
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

  describe("the chain of the pushed events", () => {
    it("receives a push whose events chain from the ones it already holds", async () => {
      const { deviceToken } = await enroll();
      const events = linked(null, [event(1), event(2), event(3)]);

      await push(bodyOf(events.slice(0, 2)), `Bearer ${deviceToken}`);
      const response = await push(bodyOf(events.slice(2)), `Bearer ${deviceToken}`);

      expect(pushEventsResponseSchema.parse(response.json())).toEqual({ status: "ok", ack_seq: 3 });
    });

    it("refuses a push whose chain is broken as revoked, storing none of its events", async () => {
      const { deviceId, deviceToken } = await enroll();
      const [first, second, third] = linked(null, [event(1), event(2), event(3)]);
      if (!first || !second || !third) {
        throw new Error("test setup: the chain holds three events");
      }
      await push(bodyOf([first]), `Bearer ${deviceToken}`);

      const response = await push(
        bodyOf([{ ...second, payload: { quantity: 9 } }, third]),
        `Bearer ${deviceToken}`,
      );

      expect(response.statusCode).toBe(403);
      expect(cloudErrorSchema.parse(response.json())).toMatchObject({ code: "revoked" });
      const stored = await route.db.select().from(inbox).where(eq(inbox.deviceId, deviceId));
      expect(stored.map((row) => row.deviceSeq)).toEqual([1]);
    });

    it("keeps the refused events aside and revokes the installation for its broken chain", async () => {
      const { deviceId, deviceToken } = await enroll();
      const altered = { ...event(1), chain_hmac: "forged-link" };

      await push(bodyOf([altered]), `Bearer ${deviceToken}`);

      expect(await route.db.select().from(refusedEvents)).toEqual([
        expect.objectContaining({
          deviceId,
          eventId: altered.event_id,
          deviceSeq: 1,
          payload: { quantity: 2 },
          chainHmac: "forged-link",
          refusedAt: NOW,
        }),
      ]);
      const [installation] = await route.db
        .select({
          revokedAt: registerInstallations.revokedAt,
          revocationReason: registerInstallations.revocationReason,
        })
        .from(registerInstallations)
        .where(eq(registerInstallations.id, deviceId));
      expect(installation).toEqual({ revokedAt: NOW, revocationReason: "outbox_chain_broken" });
    });

    it("answers revoked to the installation's next push", async () => {
      const { deviceToken } = await enroll();
      await push(bodyOf([{ ...event(1), chain_hmac: "forged-link" }]), `Bearer ${deviceToken}`);

      const response = await push(body(1), `Bearer ${deviceToken}`);

      expect(response.statusCode).toBe(403);
      expect(cloudErrorSchema.parse(response.json())).toMatchObject({ code: "revoked" });
    });
  });
});
