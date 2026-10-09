import { PUSH_BATCH_MAX_EVENTS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { pushEventsRequestSchema, pushEventsResponseSchema } from "./events.js";

const event = {
  event_id: "0199b7a0-0000-7000-8000-000000000001",
  device_seq: 1,
  aggregate_type: "Sale",
  aggregate_id: "0199b7a0-0000-7000-8000-000000000002",
  event_type: "sale_opened",
  schema_version: 1,
  payload: { lines: [{ product_id: "p1", quantity: 2 }], note: null, paid: false },
  occurred_at: "2026-09-30T12:00:00.000Z",
  actor_id: "user-1",
  chain_hmac: "ab12",
};

const telemetry = { wal_size_bytes: 4096, disk_free_bytes: 5_000_000, disk_free_ratio: 0.42 };

const request = { app_version: "1.4.0", telemetry, events: [event] };

function requestWith(overrides: Record<string, unknown>) {
  return pushEventsRequestSchema.safeParse({ ...request, ...overrides });
}

function requestWithEvent(overrides: Record<string, unknown>) {
  return requestWith({ events: [{ ...event, ...overrides }] });
}

describe("push events request", () => {
  it("accepts a batch of events with the register's telemetry", () => {
    expect(pushEventsRequestSchema.parse(request)).toEqual(request);
  });

  it("accepts a full batch and refuses one more event", () => {
    const events = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ ...event, device_seq: index + 1 }));

    expect(requestWith({ events: events(PUSH_BATCH_MAX_EVENTS) }).success).toBe(true);
    expect(requestWith({ events: events(PUSH_BATCH_MAX_EVENTS + 1) }).success).toBe(false);
  });

  it("reads an event_id whose version and variant digits are unusual in lower case", () => {
    const result = requestWithEvent({ event_id: "0123ABCD-EF01-0567-F9AB-CDEF01234567" });

    expect(result.data?.events[0]?.event_id).toBe("0123abcd-ef01-0567-f9ab-cdef01234567");
  });

  it("accepts a push of no events, which only reports the register's version and telemetry", () => {
    expect(requestWith({ events: [] }).success).toBe(true);
  });

  it("refuses a missing or empty app version", () => {
    expect(requestWith({ app_version: "" }).success).toBe(false);
    expect(pushEventsRequestSchema.safeParse({ telemetry, events: [event] }).success).toBe(false);
  });

  it.each([
    ["negative wal size", { wal_size_bytes: -1 }],
    ["fractional wal size", { wal_size_bytes: 1.5 }],
    ["negative free disk", { disk_free_bytes: -1 }],
    ["fractional free disk", { disk_free_bytes: 0.5 }],
    ["free disk ratio below 0", { disk_free_ratio: -0.01 }],
    ["free disk ratio above 1", { disk_free_ratio: 1.01 }],
  ])("refuses telemetry with a %s", (_name, change) => {
    expect(requestWith({ telemetry: { ...telemetry, ...change } }).success).toBe(false);
  });

  it("accepts telemetry at its limits", () => {
    const empty = { wal_size_bytes: 0, disk_free_bytes: 0, disk_free_ratio: 0 };
    const full = { ...empty, disk_free_ratio: 1 };

    expect(requestWith({ telemetry: empty }).success).toBe(true);
    expect(requestWith({ telemetry: full }).success).toBe(true);
  });

  it.each([
    ["an event_id that is not a uuid", { event_id: "not-a-uuid" }],
    ["a zero device_seq", { device_seq: 0 }],
    ["a fractional device_seq", { device_seq: 1.5 }],
    ["a device_seq beyond the safe integers", { device_seq: Number.MAX_SAFE_INTEGER + 1 }],
    ["an empty aggregate_type", { aggregate_type: "" }],
    ["an empty aggregate_id", { aggregate_id: "" }],
    ["an empty event_type", { event_type: "" }],
    ["a zero schema_version", { schema_version: 0 }],
    ["a payload that is not an object", { payload: [1] }],
    ["a payload with a non-integer number", { payload: { amount: 1.5 } }],
    ["an occurred_at that is not a datetime", { occurred_at: "yesterday" }],
    ["an empty actor_id", { actor_id: "" }],
    ["an empty chain_hmac", { chain_hmac: "" }],
  ])("refuses an event with %s", (_name, change) => {
    expect(requestWithEvent(change).success).toBe(false);
  });

  it("refuses an event missing one of its fields", () => {
    const { chain_hmac: _omitted, ...withoutHmac } = event;

    expect(requestWith({ events: [withoutHmac] }).success).toBe(false);
  });

  it("keeps nested payload values as sent", () => {
    const payload = { a: { b: [1, "x", true, null, { c: 2 }] } };

    expect(requestWithEvent({ payload }).data?.events[0]?.payload).toEqual(payload);
  });
});

describe("push events response", () => {
  it.each([
    [{ status: "ok", ack_seq: 0 }],
    [{ status: "ok", ack_seq: 7 }],
    [{ status: "expected_seq", ack_seq: 2, expected_seq: 3 }],
    [{ status: "stale_device", ack_seq: 9 }],
    [{ status: "update_required", ack_seq: 4 }],
  ])("accepts %j", (body) => {
    expect(pushEventsResponseSchema.parse(body)).toEqual(body);
  });

  it.each([
    [{ status: "ok" }],
    [{ status: "ok", ack_seq: -1 }],
    [{ status: "ok", ack_seq: 1.5 }],
    [{ status: "expected_seq", ack_seq: 2 }],
    [{ status: "expected_seq", ack_seq: 2, expected_seq: 0 }],
    [{ status: "stale_device" }],
    [{ status: "update_required" }],
    [{ status: "update_required", ack_seq: -1 }],
    [{ status: "revoked", ack_seq: 1 }],
    [{ ack_seq: 1 }],
  ])("refuses %j", (body) => {
    expect(pushEventsResponseSchema.safeParse(body).success).toBe(false);
  });
});
