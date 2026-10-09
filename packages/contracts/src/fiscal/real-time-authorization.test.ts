import { describe, expect, it } from "vitest";
import {
  realTimeAuthorizationRequestSchema,
  realTimeAuthorizationResponseSchema,
} from "./real-time-authorization.js";

const saleEvent = {
  event_id: "0199b7a0-0000-7000-8000-000000000001",
  device_seq: 17,
  aggregate_type: "Sale",
  aggregate_id: "0199b7a0-0000-7000-8000-000000000002",
  event_type: "sale_completed",
  schema_version: 2,
  payload: { total: 12_500, lines: [{ product_id: "p1", quantity: 2 }] },
  occurred_at: "2026-10-01T11:59:58.000Z",
  actor_id: "user-1",
  chain_hmac: "ab12",
};

const request = {
  fiscal_document_id: "0199b7a0-0000-7000-8000-000000000003",
  sale_id: "0199b7a0-0000-7000-8000-000000000002",
  point_of_sale: 12,
  number: 41,
  issued_on: "2026-10-01",
  total: 12_500,
  buyer_tax_status_code: 5,
  timeout_ms: 5_000,
  rtt_median_ms: 200,
  sale_event: saleEvent,
};

function requestWith(overrides: Record<string, unknown>) {
  return realTimeAuthorizationRequestSchema.safeParse({ ...request, ...overrides });
}

describe("realTimeAuthorizationRequestSchema", () => {
  it("reads a request to authorize a fiscal document with the sale's event attached", () => {
    expect(realTimeAuthorizationRequestSchema.parse(request)).toEqual(request);
  });

  it.each(Object.keys(request))("refuses a request without its %s", (field) => {
    expect(requestWith({ [field]: undefined }).success).toBe(false);
  });

  it.each([
    ["a fiscal document id that is not an id", { fiscal_document_id: "not-an-id" }],
    ["a sale id that is not an id", { sale_id: "not-an-id" }],
    ["a point of sale the tax authority does not allow", { point_of_sale: 0 }],
    ["a point of sale above the tax authority's maximum", { point_of_sale: 100000 }],
    ["a number of zero", { number: 0 }],
    ["a fractional number", { number: 1.5 }],
    ["a day that does not exist", { issued_on: "2026-02-30" }],
    ["a day written another way", { issued_on: "01/10/2026" }],
    ["a negative total", { total: -1 }],
    ["a fractional total", { total: 10.5 }],
    ["a fractional buyer tax status code", { buyer_tax_status_code: 5.5 }],
    ["a timeout of zero", { timeout_ms: 0 }],
    ["a fractional timeout", { timeout_ms: 5000.5 }],
    ["a negative round trip", { rtt_median_ms: -1 }],
    ["a fractional round trip", { rtt_median_ms: 10.5 }],
    ["an event without its chain proof", { sale_event: { ...saleEvent, chain_hmac: undefined } }],
  ])("refuses %s", (_case, overrides) => {
    expect(requestWith(overrides).success).toBe(false);
  });

  it("accepts a total of zero and a round trip of zero", () => {
    expect(requestWith({ total: 0, rtt_median_ms: 0 }).success).toBe(true);
  });

  it("accepts the highest point of sale number", () => {
    expect(requestWith({ point_of_sale: 99999 }).success).toBe(true);
  });

  it("keeps nothing of the request but the fields a register sends", () => {
    expect(requestWith({ register_id: "register-1" }).data).toEqual(request);
  });
});

describe("realTimeAuthorizationResponseSchema", () => {
  it.each([
    [
      "an authorization",
      {
        state: "AUTHORIZED",
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-10-11",
      },
    ],
    [
      "a content rejection with its codes",
      { state: "REJECTED", rejection_codes: [10015, 10048], rejection_class: "content" },
    ],
    [
      "a standing rejection with its codes",
      { state: "REJECTED", rejection_codes: [10005], rejection_class: "standing" },
    ],
    [
      "a rejection without codes",
      { state: "REJECTED", rejection_codes: [], rejection_class: "content" },
    ],
    ["a call that was not attempted", { state: "NOT_ATTEMPTED" }],
    ["an unclear outcome", { state: "UNCLEAR" }],
  ])("reads %s", (_case, response) => {
    expect(realTimeAuthorizationResponseSchema.parse(response)).toEqual(response);
  });

  it.each([
    [
      "an authorization without its code",
      { state: "AUTHORIZED", authorization_code_due_on: "2026-10-11" },
    ],
    [
      "an authorization with an empty code",
      { state: "AUTHORIZED", authorization_code: "", authorization_code_due_on: "2026-10-11" },
    ],
    [
      "an authorization without its due day",
      { state: "AUTHORIZED", authorization_code: "75123456789012" },
    ],
    [
      "an authorization with a due day that does not exist",
      {
        state: "AUTHORIZED",
        authorization_code: "75123456789012",
        authorization_code_due_on: "2026-13-01",
      },
    ],
    ["a rejection without its codes", { state: "REJECTED", rejection_class: "content" }],
    ["a rejection without its class", { state: "REJECTED", rejection_codes: [10015] }],
    [
      "a rejection of a class nobody knows",
      { state: "REJECTED", rejection_codes: [10015], rejection_class: "transport" },
    ],
    [
      "a rejection with a fractional code",
      { state: "REJECTED", rejection_codes: [1.5], rejection_class: "content" },
    ],
    ["a state nobody knows", { state: "PENDING" }],
    ["no state", {}],
  ])("refuses %s", (_case, response) => {
    expect(realTimeAuthorizationResponseSchema.safeParse(response).success).toBe(false);
  });

  it("keeps nothing of an unclear outcome but its state", () => {
    expect(realTimeAuthorizationResponseSchema.parse({ state: "UNCLEAR", detail: "x" })).toEqual({
      state: "UNCLEAR",
    });
  });
});
