import { describe, expect, it } from "vitest";
import {
  saleReturnedEventCreditNoteSchema,
  saleVoidCreditNoteRequestSchema,
  saleVoidCreditNoteResponseSchema,
  saleVoidedEventCreditNoteSchema,
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

  describe("the invoice a credit note that waited for it now corrects", () => {
    const invoice = {
      corrects: { voucher_type: 11, point_of_sale: 8, number: 77 },
      receiver_tax_status_code: 5,
    };

    it("is read with the request", () => {
      expect(requestWith({ invoice }).data).toEqual({ ...request, invoice });
    });

    it.each([
      [
        "a voucher that is not an invoice C",
        { corrects: { ...invoice.corrects, voucher_type: 6 } },
      ],
      ["a voucher of number zero", { corrects: { ...invoice.corrects, number: 0 } }],
      ["a fractional tax status", { receiver_tax_status_code: 5.5 }],
      ["no tax status", { receiver_tax_status_code: undefined }],
    ])("is refused with %s", (_case, overrides) => {
      expect(requestWith({ invoice: { ...invoice, ...overrides } }).success).toBe(false);
    });
  });

  it("keeps nothing of the request but the fields a register sends", () => {
    expect(requestWith({ register_id: "register-1", total: 5 }).data).toEqual(request);
  });
});

describe("saleVoidedEventCreditNoteSchema", () => {
  const creditNote = {
    id: "0199b7a0-0000-7000-8000-000000000003",
    total: 12_500,
    receiver_tax_status_code: 5,
    corrects: { voucher_type: 11, point_of_sale: 8, number: 77 },
  };
  const voidedEvent = { ...saleEvent, payload: { total: 12_500, credit_note: creditNote } };

  function eventWith(overrides: Record<string, unknown>) {
    return saleVoidedEventCreditNoteSchema.safeParse({ ...voidedEvent, ...overrides });
  }

  function creditNoteWith(overrides: Record<string, unknown>) {
    return eventWith({ payload: { credit_note: { ...creditNote, ...overrides } } });
  }

  it("reads the voided sale and the credit note its void asks for", () => {
    expect(saleVoidedEventCreditNoteSchema.parse(voidedEvent)).toEqual({
      event_type: "sale_voided",
      schema_version: 3,
      aggregate_id: saleEvent.aggregate_id,
      payload: { credit_note: creditNote },
    });
  });

  it.each([
    ["an event of another type", { event_type: "sale_completed" }],
    ["a void of an earlier version", { schema_version: 2 }],
    ["a void that asks for no credit note", { payload: { total: 12_500, credit_note: null } }],
    ["an event without its sale", { aggregate_id: "" }],
  ])("refuses %s", (_case, overrides) => {
    expect(eventWith(overrides).success).toBe(false);
  });

  it.each([
    ["an empty id", { id: "" }],
    ["a total of zero", { total: 0 }],
    ["a fractional total", { total: 1.5 }],
    ["a fractional tax status", { receiver_tax_status_code: 5.5 }],
    [
      "a voucher that is not an invoice C",
      { corrects: { ...creditNote.corrects, voucher_type: 6 } },
    ],
    ["a voucher of number zero", { corrects: { ...creditNote.corrects, number: 0 } }],
    ["a voucher of point of sale zero", { corrects: { ...creditNote.corrects, point_of_sale: 0 } }],
  ])("refuses a credit note with %s", (_case, overrides) => {
    expect(creditNoteWith(overrides).success).toBe(false);
  });
});

describe("saleReturnedEventCreditNoteSchema", () => {
  const returnId = "0199b7a0-0000-7000-8000-000000000009";
  const creditNote = {
    id: "0199b7a0-0000-7000-8000-000000000003",
    total: 3_000,
    receiver_tax_status_code: 5,
    corrects: { voucher_type: 11, point_of_sale: 8, number: 77 },
    issued_on: "2026-10-01",
  };
  const returnedEvent = {
    ...saleEvent,
    aggregate_type: "Return",
    aggregate_id: returnId,
    event_type: "sale_returned",
    schema_version: 2,
    payload: { id: returnId, sale_id: saleEvent.aggregate_id, credit_note: creditNote },
  };

  function eventWith(overrides: Record<string, unknown>) {
    return saleReturnedEventCreditNoteSchema.safeParse({ ...returnedEvent, ...overrides });
  }

  it("reads the return, its sale and the credit note it asks for", () => {
    expect(saleReturnedEventCreditNoteSchema.parse(returnedEvent)).toEqual({
      event_type: "sale_returned",
      schema_version: 2,
      aggregate_id: returnId,
      payload: { id: returnId, sale_id: saleEvent.aggregate_id, credit_note: creditNote },
    });
  });

  it("reads a credit note that waits for the invoice of its sale, which it does not correct yet", () => {
    const waiting = { ...creditNote, receiver_tax_status_code: null, corrects: null };

    expect(eventWith({ payload: { ...returnedEvent.payload, credit_note: waiting } }).success).toBe(
      true,
    );
  });

  it.each([
    ["an event of another type", { event_type: "sale_voided" }],
    ["a return of an earlier version", { schema_version: 1 }],
    [
      "a return that asks for no credit note",
      { payload: { ...returnedEvent.payload, credit_note: null } },
    ],
    ["a return without its sale", { payload: { ...returnedEvent.payload, sale_id: "" } }],
    ["an event without its return", { aggregate_id: "" }],
  ])("refuses %s", (_case, overrides) => {
    expect(eventWith(overrides).success).toBe(false);
  });
});

describe("saleVoidCreditNoteResponseSchema", () => {
  const authorized = {
    state: "AUTHORIZED",
    point_of_sale: 12,
    number: 41,
    issued_on: "2026-10-01",
    issued_at: "2026-10-01T12:31:00.000Z",
    authorization_code: "75123456789099",
    authorization_code_due_on: "2026-10-11",
  };

  it.each([
    ["an authorized credit note", authorized],
    ["a rejection", { state: "REJECTED" }],
    ["a credit note in progress", { state: "IN_PROGRESS" }],
    ["a credit note a person must regularize", { state: "REGULARIZATION_REQUIRED" }],
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
    ["an issue moment that is not an instant", { issued_at: "2026-10-01" }],
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
