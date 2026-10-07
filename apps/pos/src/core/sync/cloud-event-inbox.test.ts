import { cloudError, pushEventsRequestSchema } from "@purosur/contracts";
import type { PushedEvent, RegisterTelemetry } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import type { CloudResponse } from "../platform/cloud-client";
import { CloudEventInbox } from "./cloud-event-inbox";

const TELEMETRY: RegisterTelemetry = {
  wal_size_bytes: 4096,
  disk_free_bytes: 50_000_000_000,
  disk_free_ratio: 0.4,
};

function event(deviceSeq: number): PushedEvent {
  return {
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

function inboxAnswering(response: CloudResponse) {
  const requests: { path: string; bearerToken: string; body: unknown }[] = [];
  const inbox = new CloudEventInbox({
    post: async (path, bearerToken, body) => {
      requests.push({ path, bearerToken, body });
      return response;
    },
    deviceToken: "prefix.secret",
    appVersion: "1.4.2",
    readTelemetry: async () => TELEMETRY,
  });
  return { inbox, requests };
}

describe("the cloud's inbox, as the register pushes to it", () => {
  it("posts the events with the app version and telemetry, using the device token", async () => {
    const { inbox, requests } = inboxAnswering({ kind: "ok", body: { status: "ok", ack_seq: 2 } });

    await inbox.push([event(1), event(2)]);

    expect(requests).toEqual([
      {
        path: "/api/events",
        bearerToken: "prefix.secret",
        body: { app_version: "1.4.2", telemetry: TELEMETRY, events: [event(1), event(2)] },
      },
    ]);
    expect(pushEventsRequestSchema.safeParse(requests[0]?.body).success).toBe(true);
  });

  it("reads what the cloud received as the sequence it now holds", async () => {
    const { inbox } = inboxAnswering({ kind: "ok", body: { status: "ok", ack_seq: 2 } });

    expect(await inbox.push([event(1), event(2)])).toEqual({ kind: "received", ackSeq: 2 });
  });

  it("reads a gap with the sequence the cloud expects", async () => {
    const { inbox } = inboxAnswering({
      kind: "ok",
      body: { status: "expected_seq", ack_seq: 4, expected_seq: 5 },
    });

    expect(await inbox.push([event(7)])).toEqual({ kind: "gap", ackSeq: 4, expectedSeq: 5 });
  });

  it("reads a stale device with the sequence the cloud holds", async () => {
    const { inbox } = inboxAnswering({ kind: "ok", body: { status: "stale_device", ack_seq: 9 } });

    expect(await inbox.push([event(3)])).toEqual({ kind: "stale_device", ackSeq: 9 });
  });

  it("reads an update request with the sequence the cloud already holds", async () => {
    const { inbox } = inboxAnswering({
      kind: "ok",
      body: { status: "update_required", ack_seq: 2 },
    });

    expect(await inbox.push([event(3)])).toEqual({ kind: "update_required", ackSeq: 2 });
  });

  it("reads a revoked installation", async () => {
    const { inbox } = inboxAnswering({
      kind: "error",
      error: cloudError("revoked", "this installation was revoked"),
    });

    expect(await inbox.push([event(1)])).toEqual({ kind: "revoked" });
  });

  it("fails naming the cloud's other refusals", async () => {
    const { inbox } = inboxAnswering({
      kind: "error",
      error: cloudError("device_token_rejected", "the device token is not recognized"),
    });

    expect(await inbox.push([event(1)])).toEqual({
      kind: "failed",
      failure: { kind: "refused", code: "device_token_rejected" },
    });
  });

  it("carries how long the cloud asks to wait when it refuses for asking too often", async () => {
    const { inbox } = inboxAnswering({
      kind: "error",
      error: cloudError("rate_limited", "too many requests", [{ retry_after_seconds: 45 }]),
    });

    expect(await inbox.push([event(1)])).toEqual({
      kind: "failed",
      failure: { kind: "refused", code: "rate_limited", retryAfterSeconds: 45 },
    });
  });

  it("fails on a body that is not an answer to a push", async () => {
    const { inbox } = inboxAnswering({ kind: "ok", body: { status: "welcome" } });

    expect(await inbox.push([event(1)])).toEqual({
      kind: "failed",
      failure: { kind: "unreadable" },
    });
  });

  it("fails when the cloud can't be reached", async () => {
    const { inbox } = inboxAnswering({ kind: "unreachable" });

    expect(await inbox.push([event(1)])).toEqual({
      kind: "failed",
      failure: { kind: "unreachable" },
    });
  });
});
