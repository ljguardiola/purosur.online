import { describe, expect, it } from "vitest";
import { MAX_UNIT_PRICE_CENTS } from "./price.js";

describe("MAX_UNIT_PRICE_CENTS", () => {
  it("is the Postgres integer column's ceiling", () => {
    expect(MAX_UNIT_PRICE_CENTS).toBe(2_147_483_647);
  });
});
