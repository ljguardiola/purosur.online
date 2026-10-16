import { describe, expect, it } from "vitest";
import {
  saleVoidCreditNoteRequestSchema,
  saleVoidCreditNoteResponseSchema,
} from "./sale-void-credit-note.js";

const saleEvent = {
  event_id: "0199b7a0-0000-7000-8000-000000000001",
  device_seq: 18,
  aggregate_type: "Sale",
  aggregate_id: "0199b7a0-0000-7000-8000-000000000002",
  event_type: "sale_voided",
  schema_version: 3,
  payload: { total: 12_500, credit_note: { id: "0199b7a0-0000-7000-8000-000000000003" } },
  occurred_at: "2026-10-01T12:30:00.000Z",
  actor_id: "user-1",
  chain_hmac: "ab12",
};

const request = {
  credit_note_id: "0199b7a0-0000-7000-8000-000000000003",
  point_of_sale: 12,
  sale_event: saleEvent,
};

function requestWith(overrides: Record<string, unknown>) {
  return saleVoidCreditNoteRequestSchema.safeParse({ ...request, ...overrides });
}

describe("saleVoidCreditNoteRequestSchema", () => {
  it("reads a request for a voided sale's credit note with the void's event attached", () => {
    expect(saleVoidCreditNoteRequestSchema.parse(request)).toEqual(request);
  });

  it.each(Object.keys(request))("refuses a request without its %s", (field) => {
    expect(requestWith({ [field]: undefined }).success).toBe(false);
  });

  it.each([
    ["a credit note id that is not an id", { credit_note_id: "not-an-id" }],
    ["a point of sale the tax authority does not allow", { point_of_sale: 0 }],
    ["a point of sale above the tax authority's maximum", { point_of_sale: 100000 }],
    ["a fractional point of sale", { point_of_sale: 1.5 }],
    ["an event without its chain proof", { sale_event: { ...saleEvent, chain_hmac: undefined } }],
  ])("refuses %s", (_case, overrides) => {
    expect(requestWith(overrides).success).toBe(false);
  });

  it("accepts the highest point of sale number", () => {
    expect(requestWith({ point_of_sale: 99999 }).success).toBe(true);
  });

  it("keeps nothing of the request but the fields a register sends", () => {
    expect(requestWith({ register_id: "register-1", total: 5 }).data).toEqual(request);
  });
});

describe("saleVoidCreditNoteResponseSchema", () => {
  const authorized = {
    state: "AUTHORIZED",
    point_of_sale: 12,
    number: 41,
    issued_on: "2026-10-01",
    authorization_code: "75123456789099",
    authorization_code_due_on: "2026-10-11",
  };

  it.each([
    ["an authorized credit note", authorized],
    ["a rejection", { state: "REJECTED" }],
    ["a credit note in progress", { state: "IN_PROGRESS" }],
  ])("reads %s", (_case, response) => {
    expect(saleVoidCreditNoteResponseSchema.parse(response)).toEqual(response);
  });

  it.each(Object.keys(authorized).filter((field) => field !== "state"))(
    "refuses an authorization without its %s",
    (field) => {
      expect(
        saleVoidCreditNoteResponseSchema.safeParse({ ...authorized, [field]: undefined }).success,
      ).toBe(false);
    },
  );

  it.each([
    ["a point of sale of zero", { point_of_sale: 0 }],
    ["a number of zero", { number: 0 }],
    ["a fractional number", { number: 1.5 }],
    ["a day that does not exist", { issued_on: "2026-02-30" }],
    ["an empty code", { authorization_code: "" }],
    ["a due day that does not exist", { authorization_code_due_on: "2026-13-01" }],
  ])("refuses an authorization with %s", (_case, overrides) => {
    expect(
      saleVoidCreditNoteResponseSchema.safeParse({ ...authorized, ...overrides }).success,
    ).toBe(false);
  });

  it.each([
    ["an unknown state", { state: "UNCLEAR" }],
    ["no state", {}],
    ["a lower case state", { state: "authorized" }],
  ])("refuses %s", (_case, response) => {
    expect(saleVoidCreditNoteResponseSchema.safeParse(response).success).toBe(false);
  });
});
