import { describe, expect, it } from "vitest";
import {
  salesCoreToRendererMessageSchema,
  salesRendererToCoreMessageSchema,
} from "./core-messages.js";

const REQUEST_ID = "7d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";

function finding(reading: unknown) {
  return { type: "find-deferred-sale", request_id: REQUEST_ID, reading };
}

describe("finding a deferred sale from what the cashier typed", () => {
  it("reads a typed code as the short code to look for", () => {
    const message = salesRendererToCoreMessageSchema.parse(
      finding({ kind: "typed", code: "7KQ4M2P9" }),
    );

    expect(message).toEqual(finding({ kind: "short_code", shortCode: "7KQ4M2P9" }));
  });

  it.each([
    ["7KQ4-M2P9", "with its separator"],
    ["  7kq4m2p9 ", "in lowercase and padded"],
    ["7KQ4 M2P9", "split by a space"],
    ["7kq4-m2p9", "in lowercase with its separator"],
  ])("accepts the code %j typed %s", (code) => {
    expect(salesRendererToCoreMessageSchema.parse(finding({ kind: "typed", code }))).toEqual(
      finding({ kind: "short_code", shortCode: "7KQ4M2P9" }),
    );
  });

  it.each([
    ["too short", "7KQ4-M2P"],
    ["too long", "7KQ4-M2P9X"],
    ["outside the alphabet", "7KQ4-M2P0"],
    ["empty", ""],
    ["only a separator", "-"],
  ])("rejects a typed code that is %s", (_case, code) => {
    expect(
      salesRendererToCoreMessageSchema.safeParse(finding({ kind: "typed", code })).success,
    ).toBe(false);
  });
});

describe("finding a deferred sale from its scanned QR", () => {
  const text = "purosur-deferred-sale:0198-abc:7KQ4M2P9";

  it("reads the scanned text as the reference the QR carries", () => {
    expect(salesRendererToCoreMessageSchema.parse(finding({ kind: "scanned", text }))).toEqual(
      finding({ kind: "reference", id: "0198-abc", shortCode: "7KQ4M2P9" }),
    );
  });

  it.each([
    ["another kind of QR", "https://example.test/qr"],
    ["a reference with an invalid code", "purosur-deferred-sale:0198-abc:7KQ4M2P0"],
    ["nothing", ""],
  ])("rejects %s", (_case, scanned) => {
    expect(
      salesRendererToCoreMessageSchema.safeParse(finding({ kind: "scanned", text: scanned }))
        .success,
    ).toBe(false);
  });
});

describe("the request to find a deferred sale", () => {
  it.each([
    [
      "without its request id",
      { type: "find-deferred-sale", reading: { kind: "typed", code: "7KQ4M2P9" } },
    ],
    ["without its reading", { type: "find-deferred-sale", request_id: REQUEST_ID }],
    ["with another kind of reading", finding({ kind: "spoken", text: "7KQ4M2P9" })],
  ])("is rejected %s", (_case, message) => {
    expect(salesRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe("the result of finding a deferred sale", () => {
  const found = {
    kind: "found",
    sale_id: "sale-1",
    occurred_at: "2026-10-07T12:00:00-03:00",
    total: 6750,
    short_code: "7KQ4M2P9",
    invoice: { kind: "pending" },
    original_printed: false,
  };

  it.each([
    found,
    {
      ...found,
      invoice: { kind: "issued", point_of_sale: 12, number: 101 },
      original_printed: true,
    },
    { kind: "not_found" },
    { kind: "voided" },
    { kind: "expired" },
    { kind: "not_signed_in" },
    { kind: "lacks_permission" },
  ])("accepts the outcome $kind", (outcome) => {
    const message = { type: "find-deferred-sale-result", request_id: REQUEST_ID, outcome };

    expect(salesCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    [
      "an invoice with a point of sale of zero",
      { ...found, invoice: { kind: "issued", point_of_sale: 0, number: 1 } },
    ],
    ["an invoice without its number", { ...found, invoice: { kind: "issued", point_of_sale: 12 } }],
    ["a moment without an offset", { ...found, occurred_at: "2026-10-07T12:00:00" }],
    ["a total that is not whole", { ...found, total: 10.5 }],
    ["a sale without its short code", { ...found, short_code: undefined }],
    ["an outcome the register does not have", { kind: "cancelled" }],
  ])("rejects %s", (_case, outcome) => {
    const message = { type: "find-deferred-sale-result", request_id: REQUEST_ID, outcome };

    expect(salesCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe("printing the invoice of a deferred sale", () => {
  const print = { type: "print-deferred-sale-invoice", request_id: REQUEST_ID, sale_id: "sale-1" };

  it("accepts a request naming the sale", () => {
    expect(salesRendererToCoreMessageSchema.parse(print)).toEqual(print);
  });

  it.each(["request_id", "sale_id"])("rejects a request missing its %s", (field) => {
    const message = Object.fromEntries(Object.entries(print).filter(([key]) => key !== field));

    expect(salesRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });

  it.each([
    { kind: "started", copy: { kind: "original" } },
    { kind: "busy" },
    { kind: "already_printed" },
    { kind: "printer_not_configured" },
    { kind: "sale_voided" },
    { kind: "voided" },
    { kind: "expired" },
    { kind: "not_found" },
    { kind: "not_yet", cause: "cannot_authorize" },
    { kind: "not_yet", cause: "older_sale_blocking" },
    { kind: "not_signed_in" },
    { kind: "lacks_permission" },
    { kind: "unavailable" },
  ])("accepts the result $kind", (outcome) => {
    const message = { type: "print-deferred-sale-invoice-result", request_id: REQUEST_ID, outcome };

    expect(salesCoreToRendererMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    { kind: "not_yet", cause: "tired" },
    { kind: "not_yet" },
    { kind: "already_attempted" },
    { kind: "started", copy: { kind: "duplicate", order_number: 1.5 } },
  ])("rejects the result %j", (outcome) => {
    const message = { type: "print-deferred-sale-invoice-result", request_id: REQUEST_ID, outcome };

    expect(salesCoreToRendererMessageSchema.safeParse(message).success).toBe(false);
  });
});
