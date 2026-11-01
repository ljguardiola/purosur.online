import { describe, expect, it } from "vitest";
import { constraintViolatedBy } from "./constraint-violated-by.js";

function refusedWrite(fields: Record<string, unknown>): Error {
  return new Error("write failed", { cause: Object.assign(new Error("refused"), fields) });
}

describe("constraintViolatedBy", () => {
  it("finds the constraint postgres-js reports as constraint_name", () => {
    expect(
      constraintViolatedBy(
        refusedWrite({ constraint_name: "freights_amount_check" }),
        "freights_amount_check",
      ),
    ).toBe(true);
  });

  it("finds the constraint PGlite reports as constraint", () => {
    expect(
      constraintViolatedBy(
        refusedWrite({ constraint: "freights_amount_check" }),
        "freights_amount_check",
      ),
    ).toBe(true);
  });

  it("does not find a constraint the write did not violate", () => {
    expect(
      constraintViolatedBy(
        refusedWrite({ constraint_name: "freights_pkey" }),
        "freights_amount_check",
      ),
    ).toBe(false);
    expect(
      constraintViolatedBy(refusedWrite({ constraint: "freights_pkey" }), "freights_amount_check"),
    ).toBe(false);
  });

  it("finds nothing in a value that is not an error", () => {
    expect(constraintViolatedBy("freights_amount_check", "freights_amount_check")).toBe(false);
  });
});
