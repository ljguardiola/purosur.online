import { describe, expect, it } from "vitest";
import { discountTargetSchema } from "./discount-target.js";

describe("discountTargetSchema", () => {
  it("reads a target id in upper case in lower case", () => {
    expect(
      discountTargetSchema.parse({ kind: "TAG", id: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" }),
    ).toEqual({ kind: "TAG", id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" });
  });
});
