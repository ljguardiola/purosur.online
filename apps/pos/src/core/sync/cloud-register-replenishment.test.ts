import { cloudError, registerResetRequestSchema } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import type { CloudResponse } from "../platform/cloud-client";
import { CloudRegisterReplenishment } from "./cloud-register-replenishment";

const PREDECESSOR = {
  deviceId: "2f0c7a9e-8d1b-4c53-9a77-3b5e1d2c4f60",
  lastAcknowledgedSeq: 52,
};
const OTHER_DEVICE = "9b1e5f3a-6c2d-4e8f-a1b7-0d4c8e2f6a13";

function wireEvent(deviceSeq: number, deviceId = PREDECESSOR.deviceId) {
  return {
    device_id: deviceId,
    event_id: `018f0000-0000-7000-8000-00000000000${deviceSeq}`,
    device_seq: deviceSeq,
    aggregate_type: "CashSession",
    aggregate_id: "session-1",
    event_type: "cash_session_opened",
    schema_version: 1,
    payload: { opening_float: 5000 },
    occurred_at: "2026-09-30T12:00:00.000Z",
    actor_id: "u1",
    chain_hmac: "Y2hhaW4=",
  };
}

const WIRE_USER = {
  user_id: "5d3a8c1e-7f2b-4a94-b6d0-1e9c3f7a2b48",
  first_name: "Ana",
  role_id: "7c2e9a4b-1d5f-4b83-a0c6-8f3d2e1b5a79",
  salt: "salt",
  pin_hash: "$argon2id$hash",
  active: true,
  version: 3,
};

function feedAnswering(response: CloudResponse) {
  const requests: { path: string; bearerToken: string; body: unknown }[] = [];
  const feed = new CloudRegisterReplenishment({
    post: async (path, bearerToken, body) => {
      requests.push({ path, bearerToken, body });
      return response;
    },
    deviceToken: "prefix.secret",
  });
  return { feed, requests };
}

describe("the cloud's replenishment of a restored register, as the register reads it", () => {
  it("asks for the events after the predecessor's last acknowledged one, using the device token", async () => {
    const { feed, requests } = feedAnswering({
      kind: "ok",
      body: { events: [], next: null, users: [] },
    });

    await feed.pageAfter(PREDECESSOR, undefined);

    expect(requests).toEqual([
      {
        path: "/api/devices/current/reset",
        bearerToken: "prefix.secret",
        body: {
          predecessor_device_id: PREDECESSOR.deviceId,
          last_acknowledged_seq: 52,
        },
      },
    ]);
    expect(registerResetRequestSchema.safeParse(requests[0]?.body).success).toBe(true);
  });

  it("continues after the event the previous page ended at", async () => {
    const { feed, requests } = feedAnswering({
      kind: "ok",
      body: { events: [], next: null, users: [] },
    });

    await feed.pageAfter(PREDECESSOR, { deviceId: OTHER_DEVICE, deviceSeq: 7 });

    expect(requests[0]?.body).toEqual({
      predecessor_device_id: PREDECESSOR.deviceId,
      last_acknowledged_seq: 52,
      after: { device_id: OTHER_DEVICE, device_seq: 7 },
    });
    expect(registerResetRequestSchema.safeParse(requests[0]?.body).success).toBe(true);
  });

  it("reads a page of events with the installation that produced each, the users and where the next page starts", async () => {
    const { feed } = feedAnswering({
      kind: "ok",
      body: {
        events: [wireEvent(53), wireEvent(1, OTHER_DEVICE)],
        next: { device_id: OTHER_DEVICE, device_seq: 1 },
        users: [WIRE_USER],
      },
    });

    const answer = await feed.pageAfter(PREDECESSOR, undefined);

    const { device_id: _first, ...firstEvent } = wireEvent(53);
    const { device_id: _second, ...secondEvent } = wireEvent(1, OTHER_DEVICE);
    expect(answer).toEqual({
      kind: "page",
      page: {
        events: [
          { deviceId: PREDECESSOR.deviceId, event: firstEvent },
          { deviceId: OTHER_DEVICE, event: secondEvent },
        ],
        next: { deviceId: OTHER_DEVICE, deviceSeq: 1 },
        users: [
          {
            userId: WIRE_USER.user_id,
            firstName: "Ana",
            roleId: WIRE_USER.role_id,
            salt: "salt",
            pinHash: "$argon2id$hash",
            active: true,
            version: 3,
          },
        ],
      },
    });
  });

  it("reads a last page that names no next one and a user without a PIN", async () => {
    const { feed } = feedAnswering({
      kind: "ok",
      body: { events: [], next: null, users: [{ ...WIRE_USER, salt: null, pin_hash: null }] },
    });

    const answer = await feed.pageAfter(PREDECESSOR, undefined);

    expect(answer).toMatchObject({
      kind: "page",
      page: { next: null, users: [{ salt: null, pinHash: null }] },
    });
  });

  it.each([
    "predecessor_not_of_register",
    "predecessor_not_revoked",
    "cursor_not_of_replenishment",
  ] as const)("reads the cloud's %s refusal as a refusal", async (code) => {
    const { feed } = feedAnswering({ kind: "error", error: cloudError(code, "refused") });

    expect(await feed.pageAfter(PREDECESSOR, undefined)).toEqual({
      kind: "refused",
      refusal: code,
    });
  });

  it("fails naming the cloud's other refusals", async () => {
    const { feed } = feedAnswering({
      kind: "error",
      error: cloudError("device_token_rejected", "the device token is not recognized"),
    });

    expect(await feed.pageAfter(PREDECESSOR, undefined)).toEqual({
      kind: "failed",
      failure: { kind: "refused", code: "device_token_rejected" },
    });
  });

  it("carries how long the cloud asks to wait when it refuses for asking too often", async () => {
    const { feed } = feedAnswering({
      kind: "error",
      error: cloudError("rate_limited", "too many requests", [{ retry_after_seconds: 45 }]),
    });

    expect(await feed.pageAfter(PREDECESSOR, undefined)).toEqual({
      kind: "failed",
      failure: { kind: "refused", code: "rate_limited", retryAfterSeconds: 45 },
    });
  });

  it("fails on a body that is not a page of the replenishment", async () => {
    const { feed } = feedAnswering({ kind: "ok", body: { events: [{ event_id: "x" }] } });

    expect(await feed.pageAfter(PREDECESSOR, undefined)).toEqual({
      kind: "failed",
      failure: { kind: "unreadable" },
    });
  });

  it("fails on an event that does not say which installation produced it", async () => {
    const { device_id: _missing, ...withoutInstallation } = wireEvent(53);
    const { feed } = feedAnswering({
      kind: "ok",
      body: { events: [withoutInstallation], next: null, users: [] },
    });

    expect(await feed.pageAfter(PREDECESSOR, undefined)).toEqual({
      kind: "failed",
      failure: { kind: "unreadable" },
    });
  });

  it("answers unreachable when the cloud can't be reached", async () => {
    const { feed } = feedAnswering({ kind: "unreachable" });

    expect(await feed.pageAfter(PREDECESSOR, undefined)).toEqual({ kind: "unreachable" });
  });
});
