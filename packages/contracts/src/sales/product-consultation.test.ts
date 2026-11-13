import { describe, expect, it } from "vitest";
import {
  salesCoreToRendererMessageSchema,
  salesRendererToCoreMessageSchema,
} from "./core-messages.js";

const REQUEST_ID = "7d1c1e1e-5b1a-4a53-9c1c-3a7c6f0b2d10";

const consulted = {
  kind: "consulted",
  product_id: "almendras",
  name: "Almendras peladas",
  sale_unit: "KG",
  unit_price: 1_890_000,
  promotion: { benefit: { kind: "PERCENT_OFF", percent: 10 }, weekdays: [2] },
  weight_thousandths: 410,
  amount: 697_410,
  stock_thousandths: 12_400,
};

function answer(outcome: unknown) {
  return { type: "consult-product-result", request_id: REQUEST_ID, outcome };
}

describe("asking the core to consult a product", () => {
  it.each([
    ["by its id", { product_id: "almendras" }],
    ["by a scanned barcode", { barcode: "7790001000017" }],
  ])("accepts a consultation %s", (_case, product) => {
    const message = { type: "consult-product", request_id: REQUEST_ID, product };

    expect(salesRendererToCoreMessageSchema.parse(message)).toEqual(message);
  });

  it.each([
    ["without the product", {}],
    ["with an empty barcode", { product: { barcode: "" } }],
    ["with an empty product id", { product: { product_id: "" } }],
    ["without a request id", { request_id: undefined, product: { product_id: "almendras" } }],
  ])("rejects a consultation %s", (_case, fields) => {
    const message = { type: "consult-product", request_id: REQUEST_ID, ...fields };

    expect(salesRendererToCoreMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe("the core's answer to a product consultation", () => {
  it.each([
    consulted,
    { ...consulted, promotion: null },
    {
      ...consulted,
      promotion: { benefit: { kind: "BUY_N_PAY_M", buy_qty: 3, pay_qty: 2 }, weekdays: [] },
    },
    { ...consulted, weight_thousandths: null, amount: null },
    { ...consulted, unit_price: null, promotion: null, amount: null },
    { ...consulted, stock_thousandths: null },
    { ...consulted, stock_thousandths: -500 },
    { ...consulted, sale_unit: "UNIT", weight_thousandths: null },
    { kind: "not_found" },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
    { kind: "no_open_session" },
    { kind: "restoration_in_progress" },
    { kind: "unavailable" },
  ])("accepts the outcome $kind", (outcome) => {
    expect(salesCoreToRendererMessageSchema.parse(answer(outcome))).toEqual(answer(outcome));
  });

  it.each([
    ["a negative price", { ...consulted, unit_price: -1 }],
    ["a negative amount", { ...consulted, amount: -1 }],
    ["a fractional stock", { ...consulted, stock_thousandths: 1.5 }],
    ["an empty weight", { ...consulted, weight_thousandths: 0 }],
    ["a product sold by an unknown unit", { ...consulted, sale_unit: "BOX" }],
    [
      "a promotion percent out of range",
      { ...consulted, promotion: { benefit: { kind: "PERCENT_OFF", percent: 0 }, weekdays: [] } },
    ],
    [
      "a weekday outside the ISO week",
      { ...consulted, promotion: { benefit: consulted.promotion.benefit, weekdays: [8] } },
    ],
    ["a consultation without its stock", { ...consulted, stock_thousandths: undefined }],
    ["an outcome only adding products has", { kind: "product_unavailable" }],
  ])("rejects %s", (_case, outcome) => {
    expect(salesCoreToRendererMessageSchema.safeParse(answer(outcome)).success).toBe(false);
  });
});
