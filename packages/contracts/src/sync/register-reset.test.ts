import { REPLENISHMENT_PAGE_MAX_EVENTS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { registerResetRequestSchema, registerResetResponseSchema } from "./register-reset.js";

const PREDECESSOR = "2f0c7a9e-8d1b-4c53-9a77-3b5e1d2c4f60";
const OTHER_DEVICE = "9b1e5f3a-6c2d-4e8f-a1b7-0d4c8e2f6a13";

function anEvent(deviceSeq: number) {
  return {
    event_id: `00000000-0000-4000-8000-${String(deviceSeq).padStart(12, "0")}`,
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

const USER = {
  user_id: "5d3a8c1e-7f2b-4a94-b6d0-1e9c3f7a2b48",
  first_name: "Ana",
  role_id: "7c2e9a4b-1d5f-4b83-a0c6-8f3d2e1b5a79",
  salt: "salt",
  pin_hash: "$argon2id$hash",
  active: true,
  version: 3,
};

describe("the register reset request", () => {
  it("accepts the predecessor and the last sequence the cloud acknowledged from it", () => {
    const body = { predecessor_device_id: PREDECESSOR, last_acknowledged_seq: 0 };

    expect(registerResetRequestSchema.parse(body)).toEqual(body);
  });

  it("accepts a paging cursor after an event of an installation", () => {
    const body = {
      predecessor_device_id: PREDECESSOR,
      last_acknowledged_seq: 52,
      after: { device_id: OTHER_DEVICE, device_seq: 1 },
    };

    expect(registerResetRequestSchema.parse(body)).toEqual(body);
  });

  it("lowercases the installation ids", () => {
    const parsed = registerResetRequestSchema.parse({
      predecessor_device_id: PREDECESSOR.toUpperCase(),
      last_acknowledged_seq: 1,
      after: { device_id: OTHER_DEVICE.toUpperCase(), device_seq: 1 },
    });

    expect(parsed.predecessor_device_id).toBe(PREDECESSOR);
    expect(parsed.after?.device_id).toBe(OTHER_DEVICE);
  });

  it.each([
    [
      "a predecessor that is not an id",
      { predecessor_device_id: "device", last_acknowledged_seq: 1 },
    ],
    ["a missing predecessor", { last_acknowledged_seq: 1 }],
    [
      "a negative last acknowledged sequence",
      { predecessor_device_id: PREDECESSOR, last_acknowledged_seq: -1 },
    ],
    [
      "a fractional last acknowledged sequence",
      { predecessor_device_id: PREDECESSOR, last_acknowledged_seq: 1.5 },
    ],
    ["a missing last acknowledged sequence", { predecessor_device_id: PREDECESSOR }],
    [
      "a cursor whose installation is not an id",
      {
        predecessor_device_id: PREDECESSOR,
        last_acknowledged_seq: 1,
        after: { device_id: "x", device_seq: 1 },
      },
    ],
    [
      "a cursor at sequence zero",
      {
        predecessor_device_id: PREDECESSOR,
        last_acknowledged_seq: 1,
        after: { device_id: OTHER_DEVICE, device_seq: 0 },
      },
    ],
  ])("refuses %s", (_name, body) => {
    expect(registerResetRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe("the register reset response", () => {
  it("holds the events, where the next page starts and the branch's users", () => {
    const body = {
      events: [anEvent(53), anEvent(54)],
      next: { device_id: PREDECESSOR, device_seq: 54 },
      users: [USER],
    };

    expect(registerResetResponseSchema.parse(body)).toEqual(body);
  });

  it("accepts a last page with no next position and a user without a PIN", () => {
    const body = {
      events: [],
      next: null,
      users: [{ ...USER, salt: null, pin_hash: null }],
    };

    expect(registerResetResponseSchema.parse(body)).toEqual(body);
  });

  it("holds at most a page of events", () => {
    const events = Array.from({ length: REPLENISHMENT_PAGE_MAX_EVENTS }, (_, index) =>
      anEvent(index + 1),
    );

    expect(registerResetResponseSchema.safeParse({ events, next: null, users: [] }).success).toBe(
      true,
    );
    expect(
      registerResetResponseSchema.safeParse({
        events: [...events, anEvent(REPLENISHMENT_PAGE_MAX_EVENTS + 1)],
        next: null,
        users: [],
      }).success,
    ).toBe(false);
  });

  it.each([
    ["a missing next", { events: [], users: [] }],
    ["a missing users list", { events: [], next: null }],
    ["an event that is not a pushed event", { events: [{ event_id: "x" }], next: null, users: [] }],
    ["a user without its id", { events: [], next: null, users: [{ ...USER, user_id: undefined }] }],
    ["a next without its installation", { events: [], next: { device_seq: 3 }, users: [] }],
  ])("refuses %s", (_name, body) => {
    expect(registerResetResponseSchema.safeParse(body).success).toBe(false);
  });
});
