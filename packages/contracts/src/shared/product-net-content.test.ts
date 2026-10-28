import {
  NET_CONTENT_QUANTITY_MAX,
  NET_CONTENT_QUANTITY_MAX_DECIMALS,
  NET_CONTENT_UNITS,
} from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  checkNetContentQuantity,
  NET_CONTENT_QUANTITY_CHECK_OPTIONS,
  netContentQuantitySchema,
  productNetContentSchema,
} from "./product-net-content.js";

const MALFORMED = "netContent must be an object with a quantity and a listed unit, or absent/null";
const QUANTITY_INVALID = `netContent's quantity must be a positive number of at most ${NET_CONTENT_QUANTITY_MAX_DECIMALS} decimals, at most ${NET_CONTENT_QUANTITY_MAX}`;

describe("netContentQuantitySchema", () => {
  it("declares the quantity's maximum and its maximum number of decimals", () => {
    expect(netContentQuantitySchema.meta()).toEqual({
      maxValue: NET_CONTENT_QUANTITY_MAX,
      maxDecimals: NET_CONTENT_QUANTITY_MAX_DECIMALS,
    });
  });

  it("accepts a positive quantity within the limits", () => {
    expect(netContentQuantitySchema.safeParse(NET_CONTENT_QUANTITY_MAX).success).toBe(true);
  });

  it.each([0, -1, 1.0001, NET_CONTENT_QUANTITY_MAX + 1, Infinity, Number.NaN, "5"])(
    "rejects %j",
    (quantity) => {
      expect(netContentQuantitySchema.safeParse(quantity).success).toBe(false);
    },
  );

  it("names what a valid quantity is", () => {
    expect(netContentQuantitySchema.safeParse(0).error?.issues[0]?.message).toBe(QUANTITY_INVALID);
  });
});

describe("productNetContentSchema", () => {
  it.each([undefined, null])("reads %j as no net content", (netContent) => {
    expect(productNetContentSchema.safeParse(netContent)).toEqual({ success: true, data: null });
  });

  it.each(NET_CONTENT_UNITS)("keeps a quantity in %s and only its quantity and unit", (unit) => {
    expect(productNetContentSchema.safeParse({ quantity: 1.5, unit, extra: true }).data).toEqual({
      quantity: 1.5,
      unit,
    });
  });

  it("leaves a quantity out of range for the quantity rule to report", () => {
    expect(productNetContentSchema.safeParse({ quantity: Infinity, unit: "KG" }).success).toBe(
      true,
    );
  });

  it.each([
    "1 KG",
    [],
    {},
    { quantity: 1 },
    { unit: "KG" },
    { quantity: "1", unit: "KG" },
    { quantity: 1, unit: "LB" },
    { quantity: 1, unit: null },
  ])("rejects the net content %j as malformed", (netContent) => {
    expect(
      new Set(productNetContentSchema.safeParse(netContent).error?.issues.map((i) => i.message)),
    ).toEqual(new Set([MALFORMED]));
  });
});

describe("checkNetContentQuantity", () => {
  const body = z
    .object({ name: z.string(), netContent: productNetContentSchema })
    .superRefine(checkNetContentQuantity, NET_CONTENT_QUANTITY_CHECK_OPTIONS);

  function failingFields(candidate: unknown): unknown[] {
    return body.safeParse(candidate).error?.issues.map((issue) => issue.path[0]) ?? [];
  }

  it.each([0, -1, 1.0001, NET_CONTENT_QUANTITY_MAX + 1, Infinity, -Infinity])(
    "reports the quantity %s under netContentQuantity",
    (quantity) => {
      expect(
        body.safeParse({ name: "a", netContent: { quantity, unit: "KG" } }).error?.issues,
      ).toMatchObject([{ path: ["netContentQuantity"], message: QUANTITY_INVALID }]);
    },
  );

  it("accepts the largest quantity and no net content", () => {
    expect(
      body.safeParse({ name: "a", netContent: { quantity: NET_CONTENT_QUANTITY_MAX, unit: "G" } })
        .success,
    ).toBe(true);
    expect(body.safeParse({ name: "a", netContent: null }).success).toBe(true);
  });

  it("reports the quantity also when another field fails", () => {
    expect(failingFields({ name: 1, netContent: { quantity: 0, unit: "KG" } })).toEqual([
      "name",
      "netContentQuantity",
    ]);
  });

  it.each(["1 KG", { quantity: "0", unit: "KG" }, { quantity: 0, unit: "LB" }])(
    "reports the malformed net content %j only once, never under netContentQuantity",
    (netContent) => {
      expect(failingFields({ name: "a", netContent })).toEqual(["netContent"]);
    },
  );

  it.each([null, undefined, "Maceta", 1, []])(
    "rejects the body %j as not an object without checking the quantity",
    (candidate) => {
      expect(body.safeParse(candidate).success).toBe(false);
    },
  );
});
