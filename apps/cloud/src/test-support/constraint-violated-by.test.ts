import { describe, expect, it } from "vitest";
import { constraintViolatedBy } from "./constraint-violated-by.js";

function refusedWrite(constraint: string): Error {
  return new Error("write failed", {
    cause: Object.assign(new Error("refused"), { constraint_name: constraint }),
  });
}

describe("constraintViolatedBy", () => {
  it("finds the constraint the refused write names", () => {
    expect(
      constraintViolatedBy(refusedWrite("freights_amount_check"), "freights_amount_check"),
    ).toBe(true);
  });

  it("does not find a constraint the refused write does not name", () => {
    expect(constraintViolatedBy(refusedWrite("freights_pkey"), "freights_amount_check")).toBe(
      false,
    );
  });
});
