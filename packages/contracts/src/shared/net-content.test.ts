import { describe, expect, it } from "vitest";
import { netContentSchema } from "./net-content.js";

describe("netContentSchema", () => {
  it.each(["G", "KG", "ML", "L", "UNIT"])("accepts a quantity in %s", (unit) => {
    expect(netContentSchema.safeParse({ quantity: 1.5, unit }).data).toEqual({
      quantity: 1.5,
      unit,
    });
  });

  it.each([
    ["an unknown unit", { quantity: 1, unit: "OZ" }],
    ["a quantity that is not a number", { quantity: "1", unit: "KG" }],
    ["a missing unit", { quantity: 1 }],
    ["a missing quantity", { unit: "KG" }],
  ])("rejects %s", (_, body) => {
    expect(netContentSchema.safeParse(body).success).toBe(false);
  });
});
