import { REPLENISHMENT_PAGE_MAX_EVENTS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { registerResetRequestSchema, registerResetResponseSchema } from "./register-reset.js";

const PREDECESSOR = "2f0c7a9e-8d1b-4c53-9a77-3b5e1d2c4f60";
const OTHER_DEVICE = "9b1e5f3a-6c2d-4e8f-a1b7-0d4c8e2f6a13";

function anEvent(deviceSeq: number) {
  return {
    device_id: PREDECESSOR,
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
      credit_notes: [],
      unrequested_credit_note_ids: [],
    };

    expect(registerResetResponseSchema.parse(body)).toEqual(body);
  });

  it("accepts a last page with no next position and a user without a PIN", () => {
    const body = {
      events: [],
      next: null,
      users: [{ ...USER, salt: null, pin_hash: null }],
      credit_notes: [],
      unrequested_credit_note_ids: [],
    };

    expect(registerResetResponseSchema.parse(body)).toEqual(body);
  });

  it("holds at most a page of events", () => {
    const events = Array.from({ length: REPLENISHMENT_PAGE_MAX_EVENTS }, (_, index) =>
      anEvent(index + 1),
    );

    expect(
      registerResetResponseSchema.safeParse({
        events,
        next: null,
        users: [],
        credit_notes: [],
        unrequested_credit_note_ids: [],
      }).success,
    ).toBe(true);
    expect(
      registerResetResponseSchema.safeParse({
        events: [...events, anEvent(REPLENISHMENT_PAGE_MAX_EVENTS + 1)],
        next: null,
        users: [],
        credit_notes: [],
        unrequested_credit_note_ids: [],
      }).success,
    ).toBe(false);
  });

  it.each([
    [
      "a missing next",
      { events: [], users: [], credit_notes: [], unrequested_credit_note_ids: [] },
    ],
    [
      "a missing users list",
      { events: [], next: null, credit_notes: [], unrequested_credit_note_ids: [] },
    ],
    [
      "a missing credit notes list",
      { events: [], next: null, users: [], unrequested_credit_note_ids: [] },
    ],
    [
      "a missing list of unrequested credit notes",
      { events: [], next: null, users: [], credit_notes: [] },
    ],
    [
      "an event without the installation that produced it",
      {
        events: [{ ...anEvent(53), device_id: undefined }],
        next: null,
        users: [],
        credit_notes: [],
        unrequested_credit_note_ids: [],
      },
    ],
    [
      "an event that is not a pushed event",
      {
        events: [{ event_id: "x" }],
        next: null,
        users: [],
        credit_notes: [],
        unrequested_credit_note_ids: [],
      },
    ],
    [
      "a user without its id",
      {
        events: [],
        next: null,
        users: [{ ...USER, user_id: undefined }],
        credit_notes: [],
        unrequested_credit_note_ids: [],
      },
    ],
    [
      "a next without its installation",
      {
        events: [],
        next: { device_seq: 3 },
        users: [],
        credit_notes: [],
        unrequested_credit_note_ids: [],
      },
    ],
  ])("refuses %s", (_name, body) => {
    expect(registerResetResponseSchema.safeParse(body).success).toBe(false);
  });

  describe("the credit note answers", () => {
    const CREDIT_NOTE = "8e4b2a6c-1d93-4075-b5f8-2a7c9e0d3b61";
    const authorized = {
      credit_note_id: CREDIT_NOTE,
      answered_at: "2026-10-07T10:30:00.000Z",
      state: "AUTHORIZED",
      point_of_sale: 7,
      number: 9,
      issued_on: "2026-10-07",
      issued_at: "2026-10-07T10:29:00.000Z",
      authorization_code: "74123456789012",
      authorization_code_due_on: "2026-10-17",
    };
    const rejected = {
      credit_note_id: CREDIT_NOTE,
      answered_at: "2026-10-07T10:30:00.000Z",
      state: "REJECTED",
    };
    const alreadyCredited = {
      credit_note_id: CREDIT_NOTE,
      answered_at: "2026-10-07T10:30:00.000Z",
      state: "ALREADY_CREDITED",
    };
    const respondingWith = (creditNote: unknown) => ({
      events: [],
      next: null,
      users: [],
      credit_notes: [creditNote],
    });

    it.each([
      ["authorized", authorized],
      ["rejected", rejected],
      ["already credited", alreadyCredited],
    ])("holds the voided sales' %s credit notes", (_state, creditNote) => {
      const body = respondingWith(creditNote);

      expect(registerResetResponseSchema.parse(body)).toEqual(body);
    });

    it("lowercases the ids", () => {
      const parsed = registerResetResponseSchema.parse(
        respondingWith({
          ...rejected,
          credit_note_id: CREDIT_NOTE.toUpperCase(),
        }),
      );

      expect(parsed.credit_notes[0]).toMatchObject({ credit_note_id: CREDIT_NOTE });
    });

    it.each([
      ["a credit note still in progress", { ...rejected, state: "IN_PROGRESS" }],
      ["a credit note without a state", { ...rejected, state: undefined }],
      ["an answer without the moment it was given", { ...rejected, answered_at: undefined }],
      ["an answer given at a moment that is not a date", { ...rejected, answered_at: "soon" }],
      ["an answer without its credit note", { ...rejected, credit_note_id: undefined }],
      ["an authorization without its number", { ...authorized, number: undefined }],
      [
        "an authorization without its authorization code",
        { ...authorized, authorization_code: "" },
      ],
      [
        "an authorization issued on a day that does not exist",
        { ...authorized, issued_on: "2026-02-30" },
      ],
    ])("refuses %s", (_name, creditNote) => {
      expect(registerResetResponseSchema.safeParse(respondingWith(creditNote)).success).toBe(false);
    });
  });

  describe("the unrequested credit notes", () => {
    const UNREQUESTED = "5d0c7e19-3a42-4b86-9f1e-6c2b8a4d7e30";
    const respondingWith = (unrequested: unknown) => ({
      events: [],
      next: null,
      users: [],
      credit_notes: [],
      unrequested_credit_note_ids: unrequested,
    });

    it("holds the ids of the credit notes the cloud never recorded", () => {
      const body = respondingWith([UNREQUESTED]);

      expect(registerResetResponseSchema.parse(body)).toEqual(body);
    });

    it("lowercases the ids", () => {
      const parsed = registerResetResponseSchema.parse(respondingWith([UNREQUESTED.toUpperCase()]));

      expect(parsed.unrequested_credit_note_ids).toEqual([UNREQUESTED]);
    });

    it.each([
      ["an id that is not an id", ["not-an-id"]],
      ["a list that is not a list", UNREQUESTED],
    ])("refuses %s", (_name, unrequested) => {
      expect(registerResetResponseSchema.safeParse(respondingWith(unrequested)).success).toBe(
        false,
      );
    });
  });
});
