import { MAX_STOCK_QUANTITY, SEARCH_RESULT_LIMIT } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  stockCoreToRendererMessageSchema,
  stockRendererToCoreMessageSchema,
} from "./initial-count-core-messages.js";

const REQUEST_ID = "7d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";

const LINE = {
  movement_id: "movement-1",
  product_id: "product-1",
  product_name: "Yerba",
  sale_unit: "UNIT",
  counted: 6000,
  expires_on: "2026-12-31",
};

function acceptsRequest(message: unknown): boolean {
  return stockRendererToCoreMessageSchema.safeParse(message).success;
}

function acceptsAnswer(type: string, outcome: unknown): boolean {
  return stockCoreToRendererMessageSchema.safeParse({
    type,
    request_id: REQUEST_ID,
    outcome,
  }).success;
}

describe("stockRendererToCoreMessageSchema", () => {
  it("rejects any other message type", () => {
    expect(acceptsRequest({ type: "health-check" })).toBe(false);
    expect(acceptsRequest({})).toBe(false);
  });

  it.each([
    { type: "read-initial-count" },
    { type: "withdraw-initial-count-line", movement_id: "movement-1" },
    { type: "find-countable-product", code: "7790001" },
    { type: "search-countable-products", query: "yer" },
    { type: "search-countable-products", query: "" },
    { type: "weigh-counted-product", product_id: "product-1" },
  ])("accepts $type", (body) => {
    expect(stockRendererToCoreMessageSchema.parse({ ...body, request_id: REQUEST_ID })).toEqual({
      ...body,
      request_id: REQUEST_ID,
    });
  });

  it.each([
    { type: "read-initial-count" },
    { type: "withdraw-initial-count-line", movement_id: "movement-1" },
    { type: "find-countable-product", code: "7790001" },
    { type: "search-countable-products", query: "yer" },
    { type: "weigh-counted-product", product_id: "product-1" },
    { type: "record-initial-count-line", product_id: "product-1", counted: 1500, expires_on: null },
  ])("rejects $type without its request id", (body) => {
    expect(acceptsRequest(body)).toBe(false);
  });

  it.each([
    ["withdraw-initial-count-line", { movement_id: 3 }],
    ["find-countable-product", { code: "" }],
    ["find-countable-product", {}],
    ["search-countable-products", {}],
    ["weigh-counted-product", {}],
  ])("rejects %s with %j", (type, fields) => {
    expect(acceptsRequest({ type, request_id: REQUEST_ID, ...fields })).toBe(false);
  });

  describe("recording a line", () => {
    const record = {
      type: "record-initial-count-line",
      request_id: REQUEST_ID,
      product_id: "product-1",
      counted: 6000,
      expires_on: "2026-12-31",
    };

    it("accepts a counted quantity with its expiry, or with none", () => {
      expect(stockRendererToCoreMessageSchema.parse(record)).toEqual(record);
      expect(acceptsRequest({ ...record, expires_on: null })).toBe(true);
    });

    it.each([1, 1500, MAX_STOCK_QUANTITY])("accepts a quantity of %d thousandths", (counted) => {
      expect(acceptsRequest({ ...record, counted })).toBe(true);
    });

    it.each([0, -1000, 1.5, MAX_STOCK_QUANTITY + 1, "6000", null])(
      "rejects the quantity %j",
      (counted) => {
        expect(acceptsRequest({ ...record, counted })).toBe(false);
      },
    );

    it.each(["2026-02-30", "31/12/2026", "2026-12-31T00:00:00Z", "", 20261231])(
      "rejects the expiry %j",
      (expires_on) => {
        expect(acceptsRequest({ ...record, expires_on })).toBe(false);
      },
    );

    it.each(["product_id", "counted", "expires_on"])(
      "rejects a request missing its %s",
      (field) => {
        const message = Object.fromEntries(Object.entries(record).filter(([key]) => key !== field));

        expect(acceptsRequest(message)).toBe(false);
      },
    );
  });
});

describe("stockCoreToRendererMessageSchema", () => {
  const REFUSALS = [
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
    { kind: "not_offered" },
  ] as const;

  it("rejects any other message type", () => {
    expect(stockCoreToRendererMessageSchema.safeParse({ type: "sale" }).success).toBe(false);
  });

  it.each([
    ["read-initial-count-result", { kind: "read", offered: true, lines: [LINE] }],
    ["read-initial-count-result", { kind: "read", offered: false, lines: [] }],
    [
      "read-initial-count-result",
      { kind: "read", offered: true, lines: [{ ...LINE, expires_on: null }] },
    ],
    ["read-initial-count-result", { kind: "not_permitted" }],
    ["read-initial-count-result", { kind: "not_signed_in" }],
    ["record-initial-count-line-result", { kind: "recorded", line: LINE }],
    ...["unavailable", "unknown_product", "invalid_quantity", "invalid_expiry"].map((kind) => [
      "record-initial-count-line-result",
      { kind },
    ]),
    ...["unavailable", "not_found", "already_withdrawn", "withdrawn"].map((kind) => [
      "withdraw-initial-count-line-result",
      { kind },
    ]),
    [
      "find-countable-product-result",
      { kind: "found", product: { product_id: "product-1", name: "Queso", sale_unit: "KG" } },
    ],
    ["find-countable-product-result", { kind: "unknown_code" }],
    [
      "search-countable-products-result",
      {
        kind: "results",
        products: [
          {
            product_id: "product-1",
            name: "Queso",
            sale_unit: "KG",
            matches: [{ start: 0, length: 3 }],
          },
        ],
        more: false,
      },
    ],
    ["weigh-counted-product-result", { kind: "weighed", weight_thousandths: 1250 }],
    ...["weighing", "scale_unavailable", "unknown_product", "not_sold_by_weight"].map((kind) => [
      "weigh-counted-product-result",
      { kind },
    ]),
  ] as const)("accepts the %s answer %j", (type, outcome) => {
    expect(acceptsAnswer(type, outcome)).toBe(true);
  });

  it.each([
    "record-initial-count-line-result",
    "withdraw-initial-count-line-result",
    "find-countable-product-result",
    "search-countable-products-result",
    "weigh-counted-product-result",
  ])("accepts the refusals of %s", (type) => {
    for (const refusal of REFUSALS) {
      expect(acceptsAnswer(type, refusal)).toBe(true);
    }
  });

  it.each([
    ["read-initial-count-result", { kind: "not_offered" }],
    ["read-initial-count-result", { kind: "read", offered: true }],
    ["read-initial-count-result", { kind: "read", offered: "yes", lines: [] }],
    [
      "read-initial-count-result",
      { kind: "read", offered: true, lines: [{ ...LINE, counted: 0 }] },
    ],
    [
      "read-initial-count-result",
      { kind: "read", offered: true, lines: [{ ...LINE, sale_unit: "BOX" }] },
    ],
    [
      "read-initial-count-result",
      { kind: "read", offered: true, lines: [{ ...LINE, expires_on: "soon" }] },
    ],
    ["record-initial-count-line-result", { kind: "recorded" }],
    ["withdraw-initial-count-line-result", { kind: "recorded", line: LINE }],
    ["find-countable-product-result", { kind: "found" }],
    ["find-countable-product-result", { kind: "found", product: { name: "Queso" } }],
    ["weigh-counted-product-result", { kind: "weighed" }],
    ["weigh-counted-product-result", { kind: "weighed", weight_thousandths: 0 }],
    ["weigh-counted-product-result", { kind: "weighed", weight_thousandths: 1.5 }],
    ["search-countable-products-result", { kind: "results", products: [] }],
    ["record-initial-count-line-result", { kind: "unknown" }],
  ])("rejects the %s answer %j", (type, outcome) => {
    expect(acceptsAnswer(type, outcome)).toBe(false);
  });

  it("rejects more search results than a search shows", () => {
    const product = { product_id: "product-1", name: "Queso", sale_unit: "KG", matches: [] };

    expect(
      acceptsAnswer("search-countable-products-result", {
        kind: "results",
        products: Array.from({ length: SEARCH_RESULT_LIMIT + 1 }, () => product),
        more: true,
      }),
    ).toBe(false);
  });

  it("rejects an answer without its request id", () => {
    expect(
      stockCoreToRendererMessageSchema.safeParse({
        type: "read-initial-count-result",
        outcome: { kind: "not_permitted" },
      }).success,
    ).toBe(false);
  });
});
