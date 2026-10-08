import { describe, expect, it } from "vitest";
import { registerCoverageSchema } from "./register-coverage.js";

describe("registerCoverageSchema", () => {
  it("accepts the uncovered permissions, none or several", () => {
    const none = { uncovered_permissions: [] };
    const several = { uncovered_permissions: ["void_sale", "correct_register_clock"] };

    expect(registerCoverageSchema.safeParse(none).data).toEqual(none);
    expect(registerCoverageSchema.safeParse(several).data).toEqual(several);
  });

  it("strips keys it does not define", () => {
    expect(
      registerCoverageSchema.safeParse({ uncovered_permissions: ["void_sale"], branch: "b-1" })
        .data,
    ).toEqual({ uncovered_permissions: ["void_sale"] });
  });

  it.each([
    undefined,
    null,
    {},
    { uncovered_permissions: null },
    { uncovered_permissions: "void_sale" },
    { uncovered_permissions: [1] },
    { uncovered_permissions: ["void_a_sale"] },
  ])("refuses %j", (body) => {
    expect(registerCoverageSchema.safeParse(body).success).toBe(false);
  });
});
